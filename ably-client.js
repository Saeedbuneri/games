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

  // Subscribe to channel events using SSE
  subscribe(channelName, eventName, callback) {
    const key = `${channelName}:${eventName}`;
    
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    
    this.subscribers.get(key).push(callback);

    // Start SSE connection if not already started
    if (!this.eventSource) {
      this.startSSEConnection(channelName);
    }
  }

  // Start Server-Sent Events connection for real-time updates
  startSSEConnection(channelName) {
    const url = `${this.baseUrl}/channels/${encodeURIComponent(channelName)}/messages?clientId=${this.clientId}`;
    
    try {
      // EventSource doesn't support custom headers, use key query param
      const sseUrl = `${url}&key=${encodeURIComponent(this.apiKey)}`;
      
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        console.log('SSE Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionListeners('connected');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        this.isConnected = false;
        this.notifyConnectionListeners('disconnected');
        
        // Close and attempt reconnect
        this.eventSource.close();
        this.eventSource = null;
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            this.startSSEConnection(channelName);
          }, 2000 * this.reconnectAttempts);
        }
      };
    } catch (error) {
      console.error('Failed to start SSE:', error);
      // Fallback to polling if SSE fails
      this.startPolling(channelName);
    }
  }

  // Fallback: Polling method for receiving messages
  startPolling(channelName) {
    let lastMessageId = null;
    
    const poll = async () => {
      try {
        let url = `${this.baseUrl}/channels/${encodeURIComponent(channelName)}/messages?limit=10`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': 'Basic ' + btoa(this.apiKey)
          }
        });

        if (response.ok) {
          const messages = await response.json();
          
          // Process new messages
          messages.forEach(message => {
            if (!lastMessageId || message.id !== lastMessageId) {
              this.handleMessage(message);
              lastMessageId = message.id;
            }
          });
          
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

      // Continue polling
      setTimeout(poll, 1000);
    };

    poll();
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
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
