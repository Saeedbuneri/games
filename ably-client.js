// Ably REST API Client (No SDK needed!)
class AblyRestClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://rest.ably.io';
    this.subscribers = new Map();
    this.connectionListeners = [];
    this.clientId = 'client-' + Math.random().toString(36).substr(2, 9);
    this.isConnected = false;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
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
    const key = `${channelName}:${eventName}`;
    
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    
    this.subscribers.get(key).push(callback);

    // Start polling if not already started
    if (!this.pollingInterval) {
      this.startPolling(channelName);
    }
  }

  // Polling method for receiving messages (more reliable than SSE with REST API)
  startPolling(channelName) {
    let lastMessageTime = Date.now();
    
    const poll = async () => {
      try {
        // Get recent messages
        const url = `${this.baseUrl}/channels/${encodeURIComponent(channelName)}/messages?limit=10&direction=forwards&start=${lastMessageTime}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': 'Basic ' + btoa(this.apiKey)
          }
        });

        if (response.ok) {
          const messages = await response.json();
          
          // Process new messages
          if (messages && messages.length > 0) {
            messages.forEach(message => {
              this.handleMessage(message);
              // Update last message time
              if (message.timestamp) {
                lastMessageTime = message.timestamp + 1;
              }
            });
          }
          
          if (!this.isConnected) {
            this.isConnected = true;
            this.notifyConnectionListeners('connected');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (this.isConnected) {
          this.isConnected = false;
          this.notifyConnectionListeners('disconnected');
        }
      }
    };

    // Poll every 500ms for responsiveness
    this.pollingInterval = setInterval(poll, 500);
    
    // Initial poll
    poll();
    
    // Mark as connected immediately
    setTimeout(() => {
      this.isConnected = true;
      this.notifyConnectionListeners('connected');
    }, 100);
  }

  // Handle incoming messages
  handleMessage(message) {
    const eventName = message.name;
    const data = message.data;
    
    // Find subscribers for this event
    this.subscribers.forEach((callbacks, key) => {
      const [channel, event] = key.split(':');
      if (event === eventName) {
        callbacks.forEach(callback => {
          callback({
            data: data,
            name: eventName,
            timestamp: message.timestamp || Date.now()
          });
        });
      }
    });
  }

  // Notify connection state listeners
  notifyConnectionListeners(state) {
    this.connectionListeners.forEach(listener => {
      if (listener.event === state) {
        listener.callback();
      }
    });
  }

  // Close connection
  close() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
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
