// Shared configuration for the Badminton Racket Game
const CONFIG = {
  // Ably configuration - Will be loaded from API in production
  ABLY_API_KEY: (typeof ENV !== 'undefined' && ENV.ABLY_API_KEY) || '',
  ABLY_REST_URL: 'https://rest.ably.io',
  
  // Function to load config from Vercel environment
  async loadFromEnvironment() {
    if (window.location.hostname.includes('vercel.app')) {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        this.ABLY_API_KEY = data.ABLY_API_KEY || this.ABLY_API_KEY;
        console.log('Loaded config from Vercel environment');
      } catch (error) {
        console.warn('Could not load config from API, using local env.js');
      }
    } else {
      console.log('Using local env.js configuration');
    }
  },
  
  // Game room/channel - change this to create different game sessions
  GAME_CHANNEL: 'badminton-game-room-1',
  
  // Physics constants
  GRAVITY: 980, // pixels/s^2
  AIR_RESISTANCE: 0.98,
  COURT_WIDTH: 1200,
  COURT_HEIGHT: 800,
  NET_HEIGHT: 150,
  NET_POSITION: 600, // Center of court
  
  // Swing detection thresholds
  SMASH_THRESHOLD: 15, // m/s^2 (high acceleration)
  DROP_SHOT_THRESHOLD: 5, // m/s^2 (low acceleration)
  MIN_SWING_SPEED: 3, // Minimum speed to register a hit
  HIT_ZONE_RADIUS: 100, // Pixels around player position
  
  // Sensor smoothing
  SMOOTHING_FACTOR: 0.7, // Low-pass filter (0-1, higher = more smoothing)
  
  // Game timing
  SENSOR_UPDATE_RATE: 50, // ms between sensor updates
  PREDICTION_LOOKAHEAD: 100, // ms to predict shuttlecock position
  
  // Player positions (for 2 players)
  PLAYER_POSITIONS: {
    player1: { x: 200, y: 600 },
    player2: { x: 1000, y: 600 }
  },
  
  // Visual effects
  SMASH_SHAKE_INTENSITY: 15,
  SMASH_SHAKE_DURATION: 200, // ms
  TRAIL_LENGTH: 10,
  
  // Haptic patterns
  HAPTIC: {
    HIT: [10], // Short vibration
    SMASH: [20, 10, 20], // Double pulse
    MISS: [5, 5, 5] // Triple tap
  }
};

// Utility functions
const Utils = {
  // Low-pass filter to smooth sensor noise
  lowPassFilter: function(current, previous, alpha) {
    return alpha * current + (1 - alpha) * previous;
  },
  
  // Calculate magnitude of 3D vector
  magnitude: function(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
  },
  
  // Normalize angle to -180 to 180 range
  normalizeAngle: function(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  },
  
  // Calculate distance between two points
  distance: function(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  },
  
  // Clamp value between min and max
  clamp: function(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  
  // Linear interpolation
  lerp: function(start, end, t) {
    return start + (end - start) * t;
  },
  
  // Map value from one range to another
  map: function(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, Utils };
}
