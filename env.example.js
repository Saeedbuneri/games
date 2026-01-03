// Environment Variables Template
// Copy this file to env.js and add your actual API key
const ENV = {
  ABLY_API_KEY: 'YOUR_ABLY_API_KEY_HERE'
};

// Export for use
if (typeof window !== 'undefined') {
  window.ENV = ENV;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ENV;
}
