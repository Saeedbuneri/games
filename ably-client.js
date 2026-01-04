// Ably REST API Client (No SDK needed!)
class AblyRestClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://rest.ably.io';
    this.subscribers = new Map();
    this.connectionListeners = [];
    this.clientId = 'client-' + Math.random().toString(36).substr(2, 9);
    this.isConnected = false;
    this.subscribers = new Map(); // key: "channel:event", value: [callbacks]
    this.connectionListeners = [];
    this.pollingChannels = new Set();
    this.pollingIntervals = new Map(); // channelName -> intervalId
    this.lastMessageTimes = new Map(); // channelName -> timestamp
    this.processedMessageIds = new Set();
    console.log('AblyRestClient initialized with key:', apiKey ? '✓ Present' : '✗ Missing');
  }

  // Create channel instance
  channels = {
    get: (channelName) => {
      return {
        publish: (eventName, data) => this.publish(channelName, eventName, data),
        subscribe: (eventName, callback) => this.subscribe(channelName, eventName, callback)
      };
    }
  };

  // Connection state management
  connection = {
    on: (event, callback) => {
      this.connectionListeners.push({ event, callback });
      // If already connected and listening for 'connected', trigger immediately
      if (event === 'connected' && this.isConnected) {
        setTimeout(() => callback(), 0);
      }
    }
  };

  // Publish message to channel
  async publish(channelName, eventName, data) {
    try {
      const url = `${this.baseUrl}/channels/${encodeURIComponent(channelName)}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(this.apiKey)
        },
        body: JSON.stringify({
          name: eventName,
          data: data
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to publish: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Publish error:', error);
      return false;
    }
  }

  // Subscribe to channel events using polling
  subscribe(channelName, eventName, callback) {
    console.log('Subscribing to:', channelName, eventName);
    const key = `${channelName}:${eventName}`;
    
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    
    this.subscribers.get(key).push(callback);

    // Start polling for this channel if not already started
    if (!this.pollingChannels.has(channelName)) {
      console.log('Starting polling for channel:', channelName);
      this.startPolling(channelName);
    }
    
    // Trigger connected event if not already marked as connected
    if (!this.isConnected) {
      this.isConnected = true;
      console.log('Connection established');
      this.notifyConnectionListeners('connected');
    }
  }

  // Polling method for receiving messages (more reliable than SSE with REST API)
  startPolling(channelName) {
    if (this.pollingChannels.has(channelName)) return;
    this.pollingChannels.add(channelName);
    
    // Initialize last message time to slightly before now to catch very recent messages
    this.lastMessageTimes.set(channelName, Date.now() - 1000);
    
    const poll = async () => {
      try {
        const lastTime = this.lastMessageTimes.get(channelName);
        const url = `${this.baseUrl}/channels/${encodeURIComponent(channelName)}/messages?limit=20&direction=forwards&start=${lastTime}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': 'Basic ' + btoa(this.apiKey)
          }
        });

        if (response.ok) {
          const messages = await response.json();
          
          // Process new messages
          if (messages && messages.length > 0) {
            // Sort by timestamp to ensure correct order
            messages.sort((a, b) => a.timestamp - b.timestamp);
            
            messages.forEach(message => {
              // Skip if we've already processed this specific message ID
              if (this.processedMessageIds.has(message.id)) return;
              
              // Skip if it's older than our last processed time (safety check)
              if (message.timestamp < lastTime) return;
              
              this.handleMessage(channelName, message);
              
              // Mark as processed
              this.processedMessageIds.add(message.id);
              
              // Update last message time
              if (message.timestamp) {
                this.lastMessageTimes.set(channelName, message.timestamp);
              }
            });

            // Keep processed IDs set size manageable
            if (this.processedMessageIds.size > 200) {
              const idsArray = Array.from(this.processedMessageIds);
              this.processedMessageIds = new Set(idsArray.slice(-100));
            }
          }
          
          if (!this.isConnected) {
            this.isConnected = true;
            this.notifyConnectionListeners('connected');
          }
        }
      } catch (error) {
        console.error(`Polling error for ${channelName}:`, error);
      }
    };

    // Poll every 100ms for better responsiveness in FPS gameplay
    const intervalId = setInterval(poll, 100);
    this.pollingIntervals.set(channelName, intervalId);
    
    // Initial poll
    poll();
  }

  // Handle incoming messages
  handleMessage(channelName, message) {
    const eventName = message.name;
    
    // Parse data if it's a string
    let data = message.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        // Not JSON, keep as string
      }
    }
    
    // Find subscribers for this specific channel and event
    const key = `${channelName}:${eventName}`;
    const callbacks = this.subscribers.get(key);
    
    if (callbacks) {
      console.log(`[${channelName}] Event: ${eventName}`, data);
      callbacks.forEach(callback => {
        try {
          callback({
            data: data,
            name: eventName,
            timestamp: message.timestamp || Date.now()
          });
        } catch (err) {
          console.error('Error in subscriber callback:', err);
        }
      });
    }
  }

  // Notify connection state listeners
  notifyConnectionListeners(state) {
    this.connectionListeners.forEach(listener => {
      if (listener.event === state) {
        try {
          listener.callback();
        } catch (err) {
          console.error('Error in connection listener:', err);
        }
      }
    });
  }

  // Close connection
  close() {
    this.pollingIntervals.forEach(intervalId => clearInterval(intervalId));
    this.pollingIntervals.clear();
    this.pollingChannels.clear();
    this.isConnected = false;
  }
}

// Create Realtime-like API
class AblyRealtime {
  constructor(apiKey) {
    this.client = new AblyRestClient(apiKey);
    this.channels = this.client.channels;
    this.connection = this.client.connection;
  }
}

// Make it globally available
if (typeof window !== 'undefined') {
  window.Ably = {
    Realtime: AblyRealtime
  };
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AblyRealtime, AblyRestClient };
}
