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
    this.gameMode = 'pvp'; // pvp or bot
    
    this.init();
  }
  
  async init() {
    console.log('Host screen initializing...');
    try {
      // Load config from Vercel environment if deployed
      await CONFIG.loadFromEnvironment();
      console.log('API Key after load:', CONFIG.ABLY_API_KEY ? 'Present' : 'Missing');
      
      // Create room
      const roomCode = this.roomManager.createRoom();
      console.log('Room created:', roomCode);
      document.getElementById('roomCode').textContent = roomCode;
      document.getElementById('gameRoomCode').textContent = roomCode;
      
      // Generate QR code
      const baseUrl = window.location.origin + window.location.pathname.replace('host-screen.html', '');
      const joinUrl = baseUrl + 'controller-select.html?join=' + roomCode;
      const qrContainer = document.getElementById('qrCode');
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: joinUrl,
        width: 220,
        height: 220,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
      console.log('QR code generated for:', joinUrl);
      
      // Connect to Ably
      await this.connectToAbly();
      
      // Setup canvas
      this.setupCanvas();
      console.log('Host screen ready!');
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
        console.log('Host connected to room:', this.roomManager.roomCode);
      });
      
      this.ably.connection.on('disconnected', () => {
        this.updateConnectionStatus('Disconnected', false);
      });
      
      // Listen for player join requests
      this.channel.subscribe('playerJoinRequest', (message) => {
        this.handlePlayerJoinRequest(message.data);
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
    
    // Check if player already exists (avoid duplicates)
    if (this.players.has(playerId)) {
      console.log('Player already exists:', playerId);
      return;
    }
    
    // Calculate player number (1-based)
    const playerNumber = this.players.size + 1;
    const playerName = `Player ${playerNumber}`;
    
    // Add player
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      number: playerNumber,
      ready: true,
      joinedAt: Date.now()
    });
    
    console.log('Total players now:', this.players.size, '| New player:', playerName, '| ID:', playerId);
    
    // Send acceptance
    this.channel.publish('playerJoinAccepted', {
      playerId: playerId,
      playerNumber: playerNumber,
      playerName: playerName,
      roomCode: this.roomManager.roomCode
    });
    
    console.log('Sent acceptance to', playerName);
    
    // Update UI
    this.updatePlayerList();
    this.updateStartButton();
  }
  
  handlePlayerLeave(data) {
    console.log('Player leaving:', data);
    const player = this.players.get(data.playerId);
    
    if (player) {
      console.log(`${player.name} has left the game`);
      this.players.delete(data.playerId);
      this.updatePlayerList();
      this.updateStartButton();
      
      // Show notification
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(239, 68, 68, 0.95);
        color: white;
        padding: 15px 25px;
        border-radius: 15px;
        font-weight: 600;
        z-index: 1000;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      `;
      notification.textContent = `${player.name} left the game`;
      document.body.appendChild(notification);
      
      setTimeout(() => notification.remove(), 3000);
      
      // If game is active and player count drops below 2, pause game
      if (this.gameState && this.players.size < 2) {
        console.log('Not enough players, pausing game...');
      }
    }
  }
  
  updatePlayerList() {
    const container = document.getElementById('playerList');
    console.log('Updating player list. Total players:', this.players.size);
    console.log('Players:', Array.from(this.players.entries()).map(([id, p]) => `${p.name} (${id})`));
    
    if (this.players.size === 0) {
      container.innerHTML = '<div style="color: #64748b; font-size: 0.95em;">No players yet. Share the room code!</div>';
      return;
    }
    
    container.innerHTML = '';
    let index = 0;
    this.players.forEach((player) => {
      console.log('Rendering player:', player.name, 'at index', index);
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
    console.log('Player list rendered. Items in DOM:', container.children.length);
  }
  
  updateStartButton() {
    const button = document.getElementById('startButton');
    const requirement = document.getElementById('playerRequirement');
    const canStart = this.gameMode === 'bot' 
      ? this.players.size >= 1 
      : this.players.size >= 2;
    
    button.disabled = !canStart;
    
    console.log('Updating start button. Players:', this.players.size, 'Mode:', this.gameMode, 'Can start:', canStart);
    
    if (canStart) {
      if (this.gameMode === 'bot') {
        button.textContent = `🚀 START GAME vs AI (${this.players.size} Player)`;
      } else {
        button.textContent = `🚀 START GAME (${this.players.size} Players)`;
      }
    } else {
      const required = this.gameMode === 'bot' ? 1 : 2;
      button.textContent = `⏳ Waiting for Players (${this.players.size}/${required})`;
    }
    
    // Update requirement text
    if (requirement) {
      if (this.gameMode === 'bot') {
        requirement.textContent = 'Need at least 1 player to start (vs AI Bot)';
      } else {
        requirement.textContent = 'Need at least 2 players to start';
      }
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
    
    // Add AI bot if in bot mode and only 1 player
    if (this.host.gameMode === 'bot' && index === 1) {
      const botId = 'bot-player';
      this.gameState.addPlayer(botId);
      const botPlayer = this.gameState.players.get(botId);
      botPlayer.name = 'AI Bot 🤖';
      botPlayer.isBot = true;
      
      // Update UI for bot
      document.getElementById(`player${index + 1}Name`).textContent = 'AI Bot 🤖';
      
      // Initialize bot AI state
      botPlayer.aiState = {
        targetY: this.host.canvas.height / 2,
        reactionTime: 0,
        difficulty: 0.7, // 0-1, higher is harder
        lastDecision: 0
      };
    }
    
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
    
    // Update bot AI
    this.updateBotAI(deltaTime);
    
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
  
  updateBotAI(deltaTime) {
    // Find bot player
    let botPlayer = null;
    let botPlayerId = null;
    
    this.gameState.players.forEach((player, id) => {
      if (player.isBot) {
        botPlayer = player;
        botPlayerId = id;
      }
    });
    
    if (!botPlayer || !this.gameState.gameActive) return;
    
    const dt = deltaTime / 1000;
    const shuttlecock = this.gameState.shuttlecock;
    const ai = botPlayer.aiState;
    
    // Update reaction time
    ai.reactionTime += dt;
    
    // Predict shuttlecock trajectory if it's coming toward bot
    const isShuttleCockComingToBot = shuttlecock.vy > 0;
    
    if (isShuttleCockComingToBot && ai.reactionTime > 0.2) {
      // Calculate where shuttlecock will land
      const timeToLand = (this.host.canvas.height - 100 - shuttlecock.y) / Math.max(shuttlecock.vy, 1);
      const predictedX = shuttlecock.x + shuttlecock.vx * timeToLand;
      
      // Add some randomness based on difficulty (lower difficulty = more error)
      const errorMargin = (1 - ai.difficulty) * 150;
      const error = (Math.random() - 0.5) * errorMargin;
      
      ai.targetY = Math.max(100, Math.min(this.host.canvas.height - 100, predictedX + error));
      ai.anticipation = timeToLand;
    } else {
      // Return to center when not chasing
      ai.targetY = this.host.canvas.height / 2;
    }
    
    // Decide when to swing
    const distanceToShuttle = Math.abs(shuttlecock.x - botPlayer.position);
    const shuttleInRange = distanceToShuttle < 80 && shuttlecock.y > this.host.canvas.height - 200;
    
    if (shuttleInRange && isShuttleCockComingToBot && ai.reactionTime > 0.3) {
      // Bot swings!
      const swingSpeed = 12 + Math.random() * ai.difficulty * 8; // Speed based on difficulty
      const swingType = swingSpeed > 16 ? 'smash' : 'normal';
      
      // Simulate swing
      this.handleSwing({
        playerId: botPlayerId,
        speed: swingSpeed,
        type: swingType,
        angle: 'neutral',
        rotation: 0,
        timestamp: Date.now()
      });
      
      // Reset reaction time
      ai.reactionTime = 0;
    }
    
    // Move bot toward target position
    const movementSpeed = 400 * ai.difficulty; // Faster movement at higher difficulty
    const diff = ai.targetY - botPlayer.position;
    
    if (Math.abs(diff) > 10) {
      const moveAmount = Math.sign(diff) * movementSpeed * dt;
      botPlayer.position += moveAmount;
      botPlayer.position = Math.max(100, Math.min(this.host.canvas.width - 100, botPlayer.position));
    }
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
  // Check if enough players based on mode
  const canStart = hostScreen.gameMode === 'bot' 
    ? hostScreen.players.size >= 1 
    : hostScreen.players.size >= 2;
    
  if (!canStart) {
    const required = hostScreen.gameMode === 'bot' ? '1 player' : '2 players';
    alert(`Need at least ${required} to start!`);
    return;
  }
  
  // Hide setup, show game
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('gameScreen').classList.add('active');
  
  // Start game
  game = new HostGame(hostScreen);
  
  // Notify all players that game has started
  hostScreen.channel.publish('gameStarted', {
    timestamp: Date.now(),
    playerCount: hostScreen.players.size
  });
  
  // Handle swing events
  hostScreen.channel.subscribe('swing', (message) => {
    // Only process swings if game is active
    if (!game || !game.gameState || !game.gameState.gameActive) {
      return;
    }
    
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

function endGame() {
  if (game && game.gameState) {
    game.gameState.gameActive = false;
    
    // Notify all players
    hostScreen.channel.publish('gameEnded', {
      timestamp: Date.now(),
      finalScore: game.gameState.score
    });
    
    // Show setup screen again
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('setupScreen').style.display = 'flex';
  }
}

function pauseBadmintonGame() {
  if (!game || !game.gameState) return;
  
  game.gameState.gameActive = false;
  document.getElementById('badmintonPauseMenu').style.display = 'flex';
  
  hostScreen.channel.publish('gameEvent', {
    type: 'paused'
  });
}

function resumeBadmintonGame() {
  if (!game || !game.gameState) return;
  
  game.gameState.gameActive = true;
  document.getElementById('badmintonPauseMenu').style.display = 'none';
  
  hostScreen.channel.publish('gameEvent', {
    type: 'resumed'
  });
}

function restartBadmintonGame() {
  document.getElementById('badmintonPauseMenu').style.display = 'none';
  document.getElementById('badmintonGameOver').style.display = 'none';
  
  // Restart game
  game = new HostGame(hostScreen);
  
  hostScreen.channel.publish('gameEvent', {
    type: 'restart'
  });
}

function showBadmintonQuitConfirm() {
  if (confirm('Are you sure you want to quit? All progress will be lost.')) {
    quitBadmintonToMenu();
  }
}

function quitBadmintonToMenu() {
  if (game && game.gameState) {
    game.gameState.gameActive = false;
  }
  
  hostScreen.channel.publish('gameEnded', {
    quit: true
  });
  
  document.getElementById('badmintonPauseMenu').style.display = 'none';
  document.getElementById('badmintonGameOver').style.display = 'none';
  document.getElementById('gameScreen').classList.remove('active');
  document.getElementById('setupScreen').style.display = 'flex';
  
  if (hostScreen) {
    hostScreen.updatePlayerList();
    hostScreen.updateStartButton();
  }
}

function selectBadmintonMode(mode) {
  if (!hostScreen) return;
  
  hostScreen.gameMode = mode;
  
  // Update UI
  document.getElementById('badmintonModePvP').classList.toggle('selected', mode === 'pvp');
  document.getElementById('badmintonModeBot').classList.toggle('selected', mode === 'bot');
  
  // Update start button requirements
  hostScreen.updateStartButton();
}
