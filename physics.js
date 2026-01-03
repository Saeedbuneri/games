// Physics Engine for Badminton Shuttlecock
class ShuttlecockPhysics {
  constructor() {
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.rotation = 0;
    this.isActive = false;
    this.lastHitPlayer = null;
    this.trail = [];
    this.isPowerShot = false;
    this.spinFactor = 0; // For slice shots
  }
  
  // Launch shuttlecock from a hit
  launch(playerX, playerY, speed, angle, rotation, isSmash) {
    this.position.x = playerX;
    this.position.y = playerY;
    this.isActive = true;
    this.isPowerShot = isSmash;
    this.spinFactor = rotation;
    this.trail = [];
    
    // Convert angle to velocity components
    // Angle: 'forehand', 'backhand', 'overhead', 'neutral'
    let vx = 0, vy = 0;
    
    // Determine if player is on left or right side
    const isLeftSide = playerX < CONFIG.NET_POSITION;
    
    switch(angle) {
      case 'overhead':
        // Smash downward across net
        vx = isLeftSide ? speed * 0.7 : -speed * 0.7;
        vy = isSmash ? -speed * 1.2 : -speed * 0.5; // More downward for smash
        break;
        
      case 'forehand':
        vx = isLeftSide ? speed : -speed;
        vy = -speed * 0.5;
        break;
        
      case 'backhand':
        vx = isLeftSide ? speed * 0.8 : -speed * 0.8;
        vy = -speed * 0.4;
        break;
        
      case 'underhand':
        // High clear shot
        vx = isLeftSide ? speed * 0.6 : -speed * 0.6;
        vy = -speed * 1.5;
        break;
        
      default: // neutral
        vx = isLeftSide ? speed * 0.8 : -speed * 0.8;
        vy = -speed * 0.6;
    }
    
    // Add spin effect to horizontal velocity
    vx += this.spinFactor * 0.1;
    
    this.velocity.x = vx;
    this.velocity.y = vy;
  }
  
  // Update physics with delta time
  update(deltaTime) {
    if (!this.isActive) return;
    
    const dt = deltaTime / 1000; // Convert to seconds
    
    // Apply gravity
    this.velocity.y += CONFIG.GRAVITY * dt;
    
    // Apply air resistance
    this.velocity.x *= CONFIG.AIR_RESISTANCE;
    this.velocity.y *= CONFIG.AIR_RESISTANCE;
    
    // Apply spin effect (curve in flight)
    if (Math.abs(this.spinFactor) > 10) {
      const spinEffect = this.spinFactor * 0.05;
      this.velocity.x += spinEffect * dt;
    }
    
    // Update position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    
    // Update rotation for visual effect
    this.rotation += (this.velocity.x + this.velocity.y) * 0.5 * dt;
    
    // Store trail for visual effects
    this.trail.push({ x: this.position.x, y: this.position.y });
    if (this.trail.length > CONFIG.TRAIL_LENGTH) {
      this.trail.shift();
    }
    
    // Check boundaries
    this.checkBoundaries();
  }
  
  // Predict future position (for latency compensation)
  predictPosition(lookaheadMs) {
    if (!this.isActive) return { x: this.position.x, y: this.position.y };
    
    const dt = lookaheadMs / 1000;
    let predVelX = this.velocity.x;
    let predVelY = this.velocity.y + (CONFIG.GRAVITY * dt);
    
    return {
      x: this.position.x + predVelX * dt,
      y: this.position.y + predVelY * dt
    };
  }
  
  checkBoundaries() {
    // Ground collision
    if (this.position.y >= CONFIG.COURT_HEIGHT) {
      this.position.y = CONFIG.COURT_HEIGHT;
      this.isActive = false;
      return 'ground';
    }
    
    // Side boundaries
    if (this.position.x < 0 || this.position.x > CONFIG.COURT_WIDTH) {
      this.isActive = false;
      return 'out';
    }
    
    // Net collision (simplified)
    const netMinX = CONFIG.NET_POSITION - 20;
    const netMaxX = CONFIG.NET_POSITION + 20;
    
    if (this.position.x >= netMinX && this.position.x <= netMaxX) {
      if (this.position.y >= (CONFIG.COURT_HEIGHT - CONFIG.NET_HEIGHT)) {
        this.isActive = false;
        return 'net';
      }
    }
    
    return null;
  }
  
  // Check if shuttlecock is in hit zone of a player
  isInHitZone(playerX, playerY) {
    if (!this.isActive) return false;
    
    const distance = Utils.distance(
      this.position.x,
      this.position.y,
      playerX,
      playerY
    );
    
    return distance <= CONFIG.HIT_ZONE_RADIUS;
  }
  
  // Get current state for rendering
  getState() {
    return {
      position: { ...this.position },
      velocity: { ...this.velocity },
      rotation: this.rotation,
      isActive: this.isActive,
      isPowerShot: this.isPowerShot,
      trail: [...this.trail]
    };
  }
  
  reset(x, y) {
    this.position.x = x;
    this.position.y = y;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.rotation = 0;
    this.isActive = false;
    this.trail = [];
    this.isPowerShot = false;
    this.spinFactor = 0;
  }
}

// Game State Manager
class GameState {
  constructor() {
    this.players = new Map();
    this.shuttlecock = new ShuttlecockPhysics();
    this.score = { player1: 0, player2: 0 };
    this.currentServer = 'player1';
    this.gameActive = false;
    this.lastUpdate = Date.now();
  }
  
  addPlayer(playerId) {
    const playerCount = this.players.size;
    const position = playerCount === 0 ? 
      CONFIG.PLAYER_POSITIONS.player1 : 
      CONFIG.PLAYER_POSITIONS.player2;
    
    this.players.set(playerId, {
      id: playerId,
      position: { ...position },
      side: playerCount === 0 ? 'left' : 'right',
      ready: false,
      lastSwingTime: 0
    });
    
    // Start game when 2 players join
    if (this.players.size === 2 && !this.gameActive) {
      this.startGame();
    }
  }
  
  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.players.size < 2) {
      this.gameActive = false;
    }
  }
  
  startGame() {
    this.gameActive = true;
    this.score = { player1: 0, player2: 0 };
    this.serveShuttlecock();
  }
  
  serveShuttlecock() {
    const serverPlayer = Array.from(this.players.values())[0];
    const x = serverPlayer.position.x;
    const y = serverPlayer.position.y - 100;
    
    this.shuttlecock.reset(x, y);
    // Shuttlecock is ready to be hit
  }
  
  processSwing(playerId, swingData) {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    // Use predictive position to account for latency
    const predictedPos = this.shuttlecock.predictPosition(CONFIG.PREDICTION_LOOKAHEAD);
    
    const inHitZone = Utils.distance(
      predictedPos.x,
      predictedPos.y,
      player.position.x,
      player.position.y
    ) <= CONFIG.HIT_ZONE_RADIUS;
    
    if (inHitZone || !this.shuttlecock.isActive) {
      // Hit successful!
      this.shuttlecock.launch(
        player.position.x,
        player.position.y,
        swingData.speed,
        swingData.angle,
        swingData.rotation || 0,
        swingData.type === 'smash'
      );
      
      this.shuttlecock.lastHitPlayer = playerId;
      player.lastSwingTime = Date.now();
      
      return {
        success: true,
        type: swingData.type,
        playerId: playerId
      };
    }
    
    return { success: false, reason: 'miss' };
  }
  
  update() {
    const now = Date.now();
    const deltaTime = now - this.lastUpdate;
    this.lastUpdate = now;
    
    if (!this.gameActive) return null;
    
    // Update shuttlecock physics
    this.shuttlecock.update(deltaTime);
    
    // Check for scoring
    const collision = this.shuttlecock.checkBoundaries();
    if (collision) {
      return this.handleCollision(collision);
    }
    
    return null;
  }
  
  handleCollision(collisionType) {
    let scoringPlayer = null;
    
    if (collisionType === 'ground') {
      // Shuttlecock landed - point goes to the player on the opposite side
      if (this.shuttlecock.position.x < CONFIG.NET_POSITION) {
        scoringPlayer = 'player2';
      } else {
        scoringPlayer = 'player1';
      }
    } else if (collisionType === 'net' || collisionType === 'out') {
      // Fault - point goes to opponent of last hitter
      const lastHitter = this.shuttlecock.lastHitPlayer;
      const players = Array.from(this.players.keys());
      scoringPlayer = players.find(p => p !== lastHitter);
    }
    
    if (scoringPlayer) {
      const playerNum = Array.from(this.players.keys()).indexOf(scoringPlayer) + 1;
      this.score['player' + playerNum]++;
      
      // Reset for next serve
      setTimeout(() => this.serveShuttlecock(), 1000);
      
      return {
        type: 'score',
        scoringPlayer: scoringPlayer,
        score: { ...this.score },
        reason: collisionType
      };
    }
    
    return null;
  }
  
  getState() {
    return {
      players: Array.from(this.players.values()),
      shuttlecock: this.shuttlecock.getState(),
      score: { ...this.score },
      gameActive: this.gameActive
    };
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShuttlecockPhysics, GameState };
}
