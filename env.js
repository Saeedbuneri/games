// Environment Variables
// Copy this file to env.js and add your API key
const ENV = {
  ABLY_API_KEY: 'Dldl3Q.PfNRqg:2Pa66JnCL0WL0TVUB21QQXYL6jtAEn2sn3KD1A4MuS4'
};

// Export for use
if (typeof window !== 'undefined') {
  window.ENV = ENV;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ENV;
}
