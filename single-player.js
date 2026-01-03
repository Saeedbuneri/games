// Single Player Game with AI Robot Opponent
class SinglePlayerGame {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.humanPlayer = null;
    this.aiPlayer = null;
    this.gameState = null;
    this.canvas = null;
    this.ctx = null;
    this.lastFrameTime = Date.now();
    this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
    this.particles = [];
    this.difficulty = 'easy'; // easy, medium, hard
    
    this.init();
  }
  
  async init() {
    console.log('Single player game initializing...');
    try {
      // Create room for the human player's controller
      const roomCode = this.roomManager.createRoom();
      console.log('Room created:', roomCode);
      document.getElementById('roomCode').textContent = roomCode;
      
      // Generate QR code
      const baseUrl = window.location.origin + window.location.pathname.replace('single-player.html', '');
      const joinUrl = baseUrl + 'controller.html?join=' + roomCode;
      QRCodeGenerator.generateCanvas(joinUrl, document.getElementById('qrCode'), 220);
      console.log('QR code generated for:', joinUrl);
      
      // Connect to Ably
      await this.connectToAbly();
      
      // Setup canvas
      this.setupCanvas();
      console.log('Single player game ready!');
    } catch (error) {
      console.error('Init error:', error);
      alert('Failed to initialize: ' + error.message);
    }
  }
  
  setupCanvas() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Resize canvas to window
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
  }
  
  async connectToAbly() {
    try {
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = this.roomManager.getChannelName();
      this.channel = this.ably.channels.get(channelName);
      
      this.ably.connection.on('connected', () => {
        this.updateConnectionStatus('Connected', true);
        console.log('Connected to room:', this.roomManager.roomCode);
      });
      
      this.ably.connection.on('disconnected', () => {
        this.updateConnectionStatus('Disconnected', false);
      });
      
      // Listen for player join requests
      this.channel.subscribe('playerJoinRequest', (message) => {
        this.handlePlayerJoinRequest(message.data);
      });
      
      // Listen for swing events from human player
      this.channel.subscribe('swing', (message) => {
        this.handleHumanSwing(message.data);
      });
      
      // Listen for player disconnect
      this.channel.subscribe('playerLeave', (message) => {
        this.handlePlayerLeave(message.data);
      });
      
    } catch (error) {
      console.error('Connection error:', error);
      this.updateConnectionStatus('Connection Failed', false);
    }
  }
  
  handlePlayerJoinRequest(data) {
    console.log('Player join request received:', data);
    const playerId = data.playerId;
    
    // Only allow one human player
    if (this.humanPlayer) {
      console.log('Human player already connected');
      return;
    }
    
    // Add human player
    this.humanPlayer = {
      id: playerId,
      name: 'You',
      ready: true,
      joinedAt: Date.now()
    };
    
    console.log('Human player connected:', playerId);
    
    // Send acceptance
    this.channel.publish('playerJoinAccepted', {
      playerId: playerId,
      playerNumber: 1,
      playerName: 'You',
      roomCode: this.roomManager.roomCode
    });
    
    console.log('Sent acceptance to human player');
    
    // Update UI
    document.getElementById('playerStatus').innerHTML = '✅ <strong>Controller Connected!</strong>';
    document.getElementById('startButton').disabled = false;
    document.getElementById('startButton').textContent = '🚀 START GAME';
  }
  
  handlePlayerLeave(data) {
    if (this.humanPlayer && this.humanPlayer.id === data.playerId) {
      this.humanPlayer = null;
      document.getElementById('playerStatus').innerHTML = '⏳ Waiting for your controller...';
      document.getElementById('startButton').disabled = true;
      
      if (this.gameState) {
        this.endGame();
      }
    }
  }
  
  handleHumanSwing(swingData) {
    if (!this.gameState) return;
    
    const result = this.gameState.processSwing(this.humanPlayer.id, swingData);
    
    if (result && result.success) {
      if (swingData.type === 'smash') {
        this.screenShake = { x: 0, y: 0, intensity: 20, duration: 200 };
        this.showGameEvent('SMASH! 💥');
      }
      
      // Send haptic feedback
      this.channel.publish('haptic', {
        playerId: this.humanPlayer.id,
        pattern: swingData.type === 'smash' ? [20, 10, 20] : [10]
      });
    }
  }
  
  updateConnectionStatus(message, connected) {
    const status = document.getElementById('connectionStatus');
    status.textContent = message;
    status.className = connected ? 'connection-status connected' : 'connection-status';
  }
  
  startGame() {
    if (!this.humanPlayer) {
      alert('Please connect your controller first!');
      return;
    }
    
    // Hide setup, show game
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('gameScreen').classList.add('active');
    
    // Initialize game state
    this.gameState = new GameState();
    
    // Add human player
    this.gameState.addPlayer(this.humanPlayer.id);
    const humanGamePlayer = this.gameState.players.get(this.humanPlayer.id);
    humanGamePlayer.name = 'You';
    
    // Add AI player
    const aiId = 'ai-robot';
    this.gameState.addPlayer(aiId);
    const aiGamePlayer = this.gameState.players.get(aiId);
    aiGamePlayer.name = '🤖 Robot';
    this.aiPlayer = aiGamePlayer;
    
    // Update UI names
    document.getElementById('player1Name').textContent = 'You';
    document.getElementById('player2Name').textContent = '🤖 Robot';
    
    // Notify human player game started
    this.channel.publish('gameStarted', {
      timestamp: Date.now()
    });
    
    // Start game loop
    this.gameState.startGame();
    this.startGameLoop();
    
    // Start AI logic
    this.startAI();
  }
  
  startGameLoop() {
    const loop = () => {
      const now = Date.now();
      const deltaTime = now - this.lastFrameTime;
      this.lastFrameTime = now;
      
      this.update(deltaTime);
      this.render();
      
      requestAnimationFrame(loop);
    };
    
    loop();
  }
  
  // AI Robot Logic
  startAI() {
    this.aiLastActionTime = Date.now();
    this.aiReactionDelay = this.getAIReactionDelay();
    this.aiDecisionTimer = setInterval(() => this.updateAI(), 150);
  }
  
  getAIReactionDelay() {
    // Reaction time based on difficulty
    switch (this.difficulty) {
      case 'easy':
        return 400 + Math.random() * 200; // 400-600ms
      case 'medium':
        return 250 + Math.random() * 150; // 250-400ms
      case 'hard':
        return 100 + Math.random() * 100; // 100-200ms
      default:
        return 400;
    }
  }
  
  getAIAccuracy() {
    // Hit accuracy based on difficulty
    switch (this.difficulty) {
      case 'easy':
        return 0.6; // 60% accuracy
      case 'medium':
        return 0.8; // 80% accuracy
      case 'hard':
        return 0.95; // 95% accuracy
      default:
        return 0.6;
    }
  }
  
  updateAI() {
    if (!this.gameState || !this.gameState.gameActive) return;
    if (!this.aiPlayer) return;
    
    const shuttlecock = this.gameState.shuttlecock;
    const now = Date.now();
    
    // Check if shuttlecock is active and heading towards AI side
    if (!shuttlecock.isActive) return;
    
    const isHeadingToAI = shuttlecock.position.x > CONFIG.NET_POSITION && shuttlecock.velocity.x > 0;
    
    if (!isHeadingToAI) return;
    
    // Check if enough time has passed for reaction
    if (now - this.aiLastActionTime < this.aiReactionDelay) return;
    
    // Predict where shuttlecock will be
    const predictedPos = shuttlecock.predictPosition(200);
    
    // Check if shuttlecock is in hit zone
    const distance = Utils.distance(
      predictedPos.x,
      predictedPos.y,
      this.aiPlayer.position.x,
      this.aiPlayer.position.y
    );
    
    if (distance <= CONFIG.HIT_ZONE_RADIUS * 1.5) {
      // Decide whether to hit based on accuracy
      const accuracy = this.getAIAccuracy();
      const willHit = Math.random() < accuracy;
      
      if (willHit) {
        this.executeAISwing();
        this.aiLastActionTime = now;
        this.aiReactionDelay = this.getAIReactionDelay();
      }
    }
  }
  
  executeAISwing() {
    // Determine swing type based on shuttlecock position and difficulty
    const shuttlecock = this.gameState.shuttlecock;
    let swingType = 'forehand';
    let speed = 8;
    
    // Higher difficulty = more variety and smashes
    if (this.difficulty === 'hard' && Math.random() < 0.3) {
      swingType = 'smash';
      speed = 12;
    } else if (this.difficulty === 'medium' && Math.random() < 0.2) {
      swingType = 'smash';
      speed = 11;
    }
    
    // High shuttlecock = overhead shot
    if (shuttlecock.position.y < 200) {
      swingType = Math.random() < 0.5 ? 'overhead' : 'smash';
      speed = swingType === 'smash' ? 12 : 9;
    }
    
    const swingData = {
      playerId: this.aiPlayer.id,
      type: swingType,
      speed: speed,
      angle: swingType === 'overhead' ? 'overhead' : 'forehand',
      rotation: (Math.random() - 0.5) * 20,
      timestamp: Date.now()
    };
    
    const result = this.gameState.processSwing(this.aiPlayer.id, swingData);
    
    if (result && result.success) {
      if (swingType === 'smash') {
        this.screenShake = { x: 0, y: 0, intensity: 15, duration: 150 };
        this.showGameEvent('ROBOT SMASH! 🤖💥');
      }
      
      // Add visual effect for AI hit
      this.createHitParticles(this.aiPlayer.position.x, this.aiPlayer.position.y, '#ef4444');
    }
  }
  
  update(deltaTime) {
    const event = this.gameState.update();
    
    if (event && event.type === 'score') {
      this.handleScore(event);
    }
    
    // Update screen shake
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= deltaTime;
      const progress = this.screenShake.duration / 200;
      this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity * progress;
      this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity * progress;
    } else {
      this.screenShake.x = 0;
      this.screenShake.y = 0;
    }
    
    // Update particles
    this.particles = this.particles.filter(p => {
      p.life -= deltaTime;
      p.x += p.vx * deltaTime / 1000;
      p.y += p.vy * deltaTime / 1000;
      p.vy += 500 * deltaTime / 1000;
      return p.life > 0;
    });
  }
  
  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    
    ctx.save();
    ctx.translate(this.screenShake.x, this.screenShake.y);
    
    // Draw court
    this.drawCourt(ctx, canvas);
    
    // Draw players
    this.drawPlayers(ctx, canvas);
    
    // Draw shuttlecock
    this.drawShuttlecock(ctx, canvas);
    
    // Draw particles
    this.drawParticles(ctx);
    
    ctx.restore();
  }
  
  drawCourt(ctx, canvas) {
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1e40af');
    gradient.addColorStop(1, '#22c55e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Court dimensions (scaled to canvas)
    const courtWidth = Math.min(canvas.width * 0.8, 1200);
    const courtHeight = Math.min(canvas.height * 0.7, 800);
    const courtX = (canvas.width - courtWidth) / 2;
    const courtY = (canvas.height - courtHeight) / 2;
    
    // Court outline
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeRect(courtX, courtY, courtWidth, courtHeight);
    
    // Net
    const netX = canvas.width / 2;
    const netHeight = courtHeight * 0.2;
    const netY = courtY + courtHeight - netHeight;
    
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(netX - 5, netY, 10, netHeight);
    
    // Net mesh
    ctx.strokeStyle = 'rgba(100,100,100,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < netHeight; i += 20) {
      ctx.beginPath();
      ctx.moveTo(netX - 5, netY + i);
      ctx.lineTo(netX + 5, netY + i);
      ctx.stroke();
    }
    
    // Center line
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(netX, courtY);
    ctx.lineTo(netX, courtY + courtHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Store court bounds for physics
    this.courtBounds = { x: courtX, y: courtY, width: courtWidth, height: courtHeight, netX, netHeight };
  }
  
  drawPlayers(ctx, canvas) {
    if (!this.courtBounds) return;
    
    const bounds = this.courtBounds;
    const playerY = bounds.y + bounds.height * 0.75;
    
    let index = 0;
    this.gameState.players.forEach((player) => {
      const isLeft = index === 0;
      const x = isLeft ? bounds.x + bounds.width * 0.25 : bounds.x + bounds.width * 0.75;
      const y = playerY;
      
      // Update player position in game state
      player.position.x = x;
      player.position.y = y;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y + 50, 40, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Player body
      ctx.fillStyle = isLeft ? '#3b82f6' : '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.fill();
      
      // Player racket
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 5;
      ctx.beginPath();
      const racketX = isLeft ? x + 50 : x - 50;
      ctx.arc(racketX, y - 30, 25, 0, Math.PI * 2);
      ctx.stroke();
      
      // Player name
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(player.name || `P${index + 1}`, x, y + 80);
      
      index++;
    });
  }
  
  drawShuttlecock(ctx, canvas) {
    const state = this.gameState.shuttlecock.getState();
    if (!state.isActive && this.gameState.players.size < 2) return;
    
    const bounds = this.courtBounds;
    if (!bounds) return;
    
    // Map shuttlecock position to canvas
    const x = bounds.x + (state.position.x / 1200) * bounds.width;
    const y = bounds.y + (state.position.y / 800) * bounds.height;
    
    // Trail
    if (state.isPowerShot && state.trail.length > 1) {
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      
      state.trail.forEach((point, i) => {
        const tx = bounds.x + (point.x / 1200) * bounds.width;
        const ty = bounds.y + (point.y / 800) * bounds.height;
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      });
      ctx.stroke();
    }
    
    // Shadow
    const groundY = bounds.y + bounds.height;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, groundY, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Shuttlecock
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.rotation);
    
    // Cork
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Feathers
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
      ctx.lineTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  drawParticles(ctx) {
    this.particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.rotation !== undefined) {
        ctx.rotate((p.rotation * Math.PI) / 180);
        p.rotation += p.rotationSpeed || 0;
      }
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  
  createHitParticles(x, y, colorRGB) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200 - 100,
        size: Math.random() * 5 + 3,
        life: 500,
        maxLife: 500,
        color: colorRGB || '251, 146, 60'
      });
    }
  }
  
  handleScore(event) {
    const score1El = document.getElementById('score1');
    const score2El = document.getElementById('score2');
    
    // Animate score change
    const scoringElement = event.scoringPlayer === this.humanPlayer.id ? score1El : score2El;
    scoringElement.style.transform = 'scale(1.5)';
    scoringElement.style.filter = 'drop-shadow(0 0 40px rgba(74, 222, 128, 1))';
    
    setTimeout(() => {
      score1El.textContent = this.gameState.score.player1;
      score2El.textContent = this.gameState.score.player2;
      
      setTimeout(() => {
        scoringElement.style.transform = 'scale(1)';
        scoringElement.style.filter = 'drop-shadow(0 0 20px rgba(74, 222, 128, 0.5))';
      }, 300);
    }, 200);
    
    this.showGameEvent('POINT! 🎯');
    
    // Create confetti effect
    this.createConfetti();
    
    // Notify human player of score update
    this.channel.publish('scoreUpdate', {
      score: event.score,
      scoringPlayer: event.scoringPlayer
    });
  }
  
  showGameEvent(text) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'game-event';
    eventDiv.textContent = text;
    document.getElementById('gameScreen').appendChild(eventDiv);
    setTimeout(() => eventDiv.remove(), 1000);
  }
  
  createConfetti() {
    const colors = ['255, 107, 107', '78, 205, 196', '255, 195, 18', '162, 155, 254', '255, 121, 198'];
    const confettiCount = 15;
    
    for (let i = 0; i < confettiCount; i++) {
      const particle = {
        x: this.canvas.width / 2,
        y: this.canvas.height / 2,
        vx: (Math.random() - 0.5) * 500,
        vy: (Math.random() - 0.5) * 500 - 200,
        size: Math.random() * 8 + 4,
        life: 2000,
        maxLife: 2000,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10
      };
      this.particles.push(particle);
    }
  }
  
  endGame() {
    if (this.aiDecisionTimer) {
      clearInterval(this.aiDecisionTimer);
    }
    
    window.location.href = 'start.html';
  }
}

// Initialize
let singlePlayerGame;

window.addEventListener('load', () => {
  singlePlayerGame = new SinglePlayerGame();
});

function startGame() {
  singlePlayerGame.startGame();
}

function selectDifficulty(difficulty) {
  singlePlayerGame.difficulty = difficulty;
  
  // Update UI
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  document.getElementById(`btn-${difficulty}`).classList.add('selected');
  
  // Update description
  const descriptions = {
    easy: 'Perfect for beginners - Robot reacts slower with 60% accuracy',
    medium: 'Balanced challenge - Robot has good reflexes with 80% accuracy',
    hard: 'Expert mode - Lightning fast robot with 95% accuracy!'
  };
  
  const descEl = document.getElementById('difficultyDescription');
  if (descEl) {
    descEl.textContent = descriptions[difficulty];
    descEl.style.animation = 'none';
    setTimeout(() => {
      descEl.style.animation = 'fadeIn 0.5s ease';
    }, 10);
  }
}

function goBack() {
  window.location.href = 'start.html';
}

function endGame() {
  if (confirm('Are you sure you want to end the game?')) {
    singlePlayerGame.endGame();
  }
}
