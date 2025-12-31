// Host Screen Game Logic
class HostScreen {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.players = new Map();
    this.gameState = null;
    this.canvas = null;
    this.ctx = null;
    this.lastFrameTime = Date.now();
    this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
    this.particles = [];
    
    this.init();
  }
  
  async init() {
    // Create room
    const roomCode = this.roomManager.createRoom();
    document.getElementById('roomCode').textContent = roomCode;
    document.getElementById('gameRoomCode').textContent = roomCode;
    
    // Generate QR code
    const joinUrl = window.location.origin + window.location.pathname.replace('host-screen.html', 'start.html') + '?join=' + roomCode;
    QRCodeGenerator.generateCanvas(joinUrl, document.getElementById('qrCode'), 200);
    
    // Connect to Ably
    await this.connectToAbly();
    
    // Setup canvas
    this.setupCanvas();
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
        console.log('Host connected to room:', this.roomManager.roomCode);
      });
      
      this.ably.connection.on('disconnected', () => {
        this.updateConnectionStatus('Disconnected', false);
      });
      
      // Listen for player join requests
      this.channel.subscribe('playerJoinRequest', (message) => {
        this.handlePlayerJoinRequest(message.data);
      });
      
      // Listen for swing events
      this.channel.subscribe('swing', (message) => {
        this.handleSwing(message.data);
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
    const playerId = data.playerId;
    const playerName = data.playerName || `Player ${this.players.size + 1}`;
    
    // Add player
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      ready: true,
      joinedAt: Date.now()
    });
    
    // Send acceptance
    this.channel.publish('playerJoinAccepted', {
      playerId: playerId,
      playerNumber: this.players.size,
      roomCode: this.roomManager.roomCode
    });
    
    // Update UI
    this.updatePlayerList();
    this.updateStartButton();
    
    console.log('Player joined:', playerName);
  }
  
  handlePlayerLeave(data) {
    this.players.delete(data.playerId);
    this.updatePlayerList();
    this.updateStartButton();
  }
  
  updatePlayerList() {
    const container = document.getElementById('playerList');
    
    if (this.players.size === 0) {
      container.innerHTML = '<div style="color: #64748b; font-size: 0.95em;">No players yet. Share the room code!</div>';
      return;
    }
    
    container.innerHTML = '';
    let index = 0;
    this.players.forEach((player) => {
      const colors = ['🔵', '🔴', '🟢', '🟡'];
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <div class="player-avatar">${colors[index % colors.length]}</div>
        <div style="flex: 1; text-align: left;">
          <div style="font-weight: 600; font-size: 1.1em;">${player.name}</div>
          <div style="font-size: 0.85em; opacity: 0.7;">Ready to play</div>
        </div>
        <div style="color: #4ade80; font-size: 1.2em;">✓</div>
      `;
      container.appendChild(item);
      index++;
    });
  }
  
  updateStartButton() {
    const button = document.getElementById('startButton');
    const canStart = this.players.size >= 2;
    
    button.disabled = !canStart;
    
    if (canStart) {
      button.textContent = `🚀 START GAME (${this.players.size} Players)`;
    } else {
      button.textContent = `⏳ Waiting (${this.players.size}/2 Players)`;
    }
  }
  
  updateConnectionStatus(message, connected) {
    const status = document.getElementById('connectionStatus');
    status.textContent = message;
    status.className = connected ? 'connection-status connected' : 'connection-status';
  }
}

// Game class
class HostGame {
  constructor(hostScreen) {
    this.host = hostScreen;
    this.gameState = new GameState();
    this.lastFrameTime = Date.now();
    this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
    this.particles = [];
    
    // Assign players to game
    let index = 0;
    this.host.players.forEach((player, id) => {
      if (index < 2) {
        this.gameState.addPlayer(id);
        const gameplayer = this.gameState.players.get(id);
        gameplayer.name = player.name;
        
        // Update UI
        document.getElementById(`player${index + 1}Name`).textContent = player.name;
        index++;
      }
    });
    
    // Notify players game started
    this.host.channel.publish('gameStarted', {
      timestamp: Date.now()
    });
    
    // Start game loop
    this.gameState.startGame();
    this.startGameLoop();
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
    const ctx = this.host.ctx;
    const canvas = this.host.canvas;
    
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
    
    this.gameState.players.forEach((player, index) => {
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
      ctx.arc(x + 50, y - 30, 25, 0, Math.PI * 2);
      ctx.stroke();
      
      // Player name
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(player.name || `P${index + 1}`, x, y + 80);
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
      ctx.fillStyle = `rgba(${p.color}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  
  handleScore(event) {
    document.getElementById('score1').textContent = this.gameState.score.player1;
    document.getElementById('score2').textContent = this.gameState.score.player2;
    
    this.showGameEvent('POINT! 🎯');
    
    this.host.channel.publish('scoreUpdate', {
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
}

// Initialize
let hostScreen;
let game;

window.addEventListener('load', () => {
  hostScreen = new HostScreen();
});

function startGame() {
  // Hide setup, show game
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('gameScreen').classList.add('active');
  
  // Start game
  game = new HostGame(hostScreen);
  
  // Handle swing events
  hostScreen.channel.subscribe('swing', (message) => {
    const result = game.gameState.processSwing(message.data.playerId, message.data);
    
    if (result && result.success) {
      if (message.data.type === 'smash') {
        game.screenShake = { x: 0, y: 0, intensity: 20, duration: 200 };
        game.showGameEvent('SMASH! 💥');
      }
      
      // Send haptic feedback
      hostScreen.channel.publish('haptic', {
        playerId: message.data.playerId,
        pattern: message.data.type === 'smash' ? [20, 10, 20] : [10]
      });
    }
  });
}
