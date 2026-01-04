// Space Shooter Host Screen Logic
class SpaceShooterHost {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.players = new Map();
    
    // Check URL for initial game mode
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    this.gameMode = modeParam === 'bot' ? 'bot' : 'pvp';
    
    this.game = null;
    this.canvas = null;
    this.ctx = null;
    this.isPaused = false;
    
    this.init();
  }
  
  async init() {
    console.log('Space Shooter host initializing...');
    try {
      // Load config from Vercel environment if deployed
      await CONFIG.loadFromEnvironment();
      
      const roomCode = this.roomManager.createRoom();
      console.log('Room created:', roomCode);
      document.getElementById('roomCode').textContent = roomCode;
      document.getElementById('gameRoomCode').textContent = roomCode;
      
      const baseUrl = window.location.origin + window.location.pathname.replace('space-shooter-host.html', '');
      const joinUrl = baseUrl + 'controller-select.html?join=' + roomCode;
      console.log('Controller URL:', joinUrl);
      
      try {
        QRCodeGenerator.generateCanvas(joinUrl, document.getElementById('qrCode'), 220);
      } catch (qrError) {
        console.error('QR Code generation error:', qrError);
        document.getElementById('qrCode').innerHTML = '<p style="color: #ef4444;">QR Code Error</p><p style="font-size: 0.9em;">Join manually with room code</p>';
      }
      
      await this.connectToAbly();
      this.setupCanvas();
      this.updateStartButton(); // Update button based on game mode
      console.log('Space Shooter host ready!');
    } catch (error) {
      console.error('Init error:', error);
      alert('Failed to initialize: ' + error.message);
    }
  }
  
  setupCanvas() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    
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
      const channelName = `space-shooter-room-${this.roomManager.roomCode}`;
      this.channel = this.ably.channels.get(channelName);
      
      this.ably.connection.on('connected', () => {
        this.updateConnectionStatus('Connected', true);
        console.log('Host connected to room:', this.roomManager.roomCode);
      });
      
      this.channel.subscribe('playerJoinRequest', (message) => {
        this.handlePlayerJoinRequest(message.data);
      });
      
      this.channel.subscribe('playerAction', (message) => {
        if (this.game) {
          this.game.handlePlayerAction(message.data);
        }
      });
      
      this.channel.subscribe('playerLeave', (message) => {
        this.handlePlayerLeave(message.data);
      });
      
    } catch (error) {
      console.error('Connection error:', error);
      this.updateConnectionStatus('Connection Failed', false);
    }
  }
  
  handlePlayerJoinRequest(data) {
    console.log('Player join request:', data);
    const playerId = data.playerId;
    
    if (this.players.has(playerId)) {
      console.log('Player already exists:', playerId);
      return;
    }
    
    const playerNumber = this.players.size + 1;
    const playerName = `Player ${playerNumber}`;
    const side = playerNumber === 1 ? 'left' : 'right';
    
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      number: playerNumber,
      side: side,
      ready: true
    });
    
    console.log(`${playerName} joined on ${side} side`);
    
    this.channel.publish('playerJoinAccepted', {
      playerId: playerId,
      playerNumber: playerNumber,
      playerName: playerName,
      side: side,
      roomCode: this.roomManager.roomCode
    });
    
    this.updatePlayerList();
    this.updateStartButton();
  }
  
  handlePlayerLeave(data) {
    const player = this.players.get(data.playerId);
    if (player) {
      console.log(`${player.name} left the game`);
      this.players.delete(data.playerId);
      this.updatePlayerList();
      this.updateStartButton();
      
      if (this.game && this.game.active) {
        this.game.playerDisconnected(player.side);
      }
    }
  }
  
  updatePlayerList() {
    const container = document.getElementById('playerList');
    
    if (this.players.size === 0) {
      container.innerHTML = '<div style="color: #64748b; font-size: 0.95em;">Waiting for players...</div>';
      return;
    }
    
    container.innerHTML = '';
    this.players.forEach((player) => {
      const icons = { left: '🔵', right: '🔴' };
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <div class="player-avatar">${icons[player.side]}</div>
        <div style="flex: 1; text-align: left;">
          <div style="font-weight: 600; font-size: 1.1em;">${player.name}</div>
          <div style="font-size: 0.85em; opacity: 0.7;">${player.side} side - Ready</div>
        </div>
        <div style="color: #4ade80; font-size: 1.2em;">✓</div>
      `;
      container.appendChild(item);
    });
  }
  
  updateStartButton() {
    const button = document.getElementById('startButton');
    const canStart = this.gameMode === 'bot' ? this.players.size >= 1 : this.players.size >= 2;
    
    button.disabled = !canStart;
    
    if (this.gameMode === 'bot') {
      button.textContent = this.players.size >= 1 
        ? `🚀 START GAME vs AI` 
        : `⏳ Waiting for Player (${this.players.size}/1)`;
    } else {
      button.textContent = canStart 
        ? `🚀 START GAME (${this.players.size} Players)` 
        : `⏳ Waiting for Players (${this.players.size}/2)`;
    }
  }
  
  updateConnectionStatus(message, connected) {
    const status = document.getElementById('connectionStatus');
    status.textContent = message;
    status.style.color = connected ? '#4ade80' : '#f87171';
  }
}

// Game Logic
class SpaceShooterGame {
  constructor(host) {
    this.host = host;
    this.canvas = host.canvas;
    this.ctx = host.ctx;
    this.active = true;
    this.lastFrameTime = Date.now();
    
    this.players = {
      left: {
        x: 300,
        y: this.canvas.height / 2,
        width: 120,
        height: 180,
        health: 100,
        score: 0,
        bullets: [],
        moveUp: false,
        moveDown: false,
        shooting: false,
        lastShot: 0,
        fireRate: 200,
        color: '#3b82f6',
        playerId: null,
        isBot: false,
        rotation: 0,
        powerUpTimer: 0,
        hasPowerUp: false
      },
      right: {
        x: this.canvas.width - 300,
        y: this.canvas.height / 2,
        width: 120,
        height: 180,
        health: 100,
        score: 0,
        bullets: [],
        moveUp: false,
        moveDown: false,
        shooting: false,
        lastShot: 0,
        fireRate: 200,
        color: '#ef4444',
        playerId: null,
        isBot: false,
        rotation: 0,
        powerUpTimer: 0,
        hasPowerUp: false
      }
    };
    
    // Assign players
    let leftAssigned = false;
    let rightAssigned = false;
    
    host.players.forEach((player) => {
      if (player.side === 'left' && !leftAssigned) {
        this.players.left.playerId = player.id;
        this.players.left.name = player.name;
        leftAssigned = true;
      } else if (player.side === 'right' && !rightAssigned) {
        this.players.right.playerId = player.id;
        this.players.right.name = player.name;
        rightAssigned = true;
      }
    });
    
    // Enable bot if in bot mode
    if (host.gameMode === 'bot') {
      if (!rightAssigned) {
        this.players.right.isBot = true;
        this.players.right.name = 'AI Bot 🤖';
      }
      if (!leftAssigned) {
        this.players.left.isBot = true;
        this.players.left.name = 'AI Bot 🤖';
      }
    }
    
    // Update UI
    document.getElementById('player1Name').textContent = this.players.left.name || 'Player 1';
    document.getElementById('player2Name').textContent = this.players.right.name || 'Player 2';
    
    // Particles for effects
    this.particles = [];
    this.explosions = [];
    
    // Stars background
    this.stars = [];
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1
      });
    }
    
    // Notify players
    host.channel.publish('gameStarted', {
      timestamp: Date.now(),
      gameMode: host.gameMode
    });
    
    this.startGameLoop();
  }
  
  startGameLoop() {
    const loop = () => {
      if (!this.active) return;
      
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
    const dt = deltaTime / 1000;
    
    // Update stars
    this.stars.forEach(star => {
      star.x -= star.speed * deltaTime;
      if (star.x < 0) star.x = this.canvas.width;
    });
    
    // Update bot AI
    if (this.players.right.isBot) {
      this.updateBot('right', dt);
    }
    if (this.players.left.isBot) {
      this.updateBot('left', dt);
    }
    
    // Update player positions
    ['left', 'right'].forEach(side => {
      const player = this.players[side];
      
      if (player.moveUp) {
        player.y -= 400 * dt;
        player.rotation = -0.15; // Tilt up
      } else if (player.moveDown) {
        player.y += 400 * dt;
        player.rotation = 0.15; // Tilt down
      } else {
        player.rotation = 0; // Level
      }
      
      // Keep in bounds
      player.y = Math.max(player.height / 2, Math.min(this.canvas.height - player.height / 2, player.y));
      
      // Update power-up timer (boost every 15 seconds for 5 seconds)
      player.powerUpTimer += dt;
      if (player.powerUpTimer >= 15 && player.powerUpTimer < 20) {
        if (!player.hasPowerUp) {
          player.hasPowerUp = true;
          player.fireRate = 100; // Faster shooting
          this.showGameEvent(`${side.toUpperCase()} BOOST ACTIVATED! 🚀`);
        }
      } else if (player.powerUpTimer >= 20) {
        player.hasPowerUp = false;
        player.fireRate = 200; // Normal shooting
        player.powerUpTimer = 0;
      }
      
      // Auto-shoot
      if (player.shooting) {
        const now = Date.now();
        if (now - player.lastShot >= player.fireRate) {
          this.fireBullet(side);
          player.lastShot = now;
        }
      }
      
      // Update bullets
      player.bullets = player.bullets.filter(bullet => {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        
        // Check collision with opponent
        const opponent = side === 'left' ? this.players.right : this.players.left;
        const hit = this.checkBulletCollision(bullet, opponent);
        
        if (hit) {
          this.onHit(side, side === 'left' ? 'right' : 'left');
          this.createExplosion(bullet.x, bullet.y);
          return false;
        }
        
        // Remove if off screen
        return bullet.x > 0 && bullet.x < this.canvas.width;
      });
    });
    
    // Update particles
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });
    
    // Update explosions
    this.explosions = this.explosions.filter(e => {
      e.life -= dt;
      e.radius += 50 * dt;
      return e.life > 0;
    });
    
    // Check for game over
    if (this.players.left.health <= 0 || this.players.right.health <= 0) {
      this.gameOver();
    }
  }
  
  updateBot(side, dt) {
    const bot = this.players[side];
    const opponent = this.players[side === 'left' ? 'right' : 'left'];
    
    // Initialize bot AI state if not exists
    if (!bot.aiState) {
      bot.aiState = {
        targetY: this.canvas.height / 2,
        strategyTimer: 0,
        strategy: 'aggressive',
        dodgeTimer: 0,
        lastShot: 0
      };
    }
    
    bot.aiState.strategyTimer += dt;
    bot.aiState.dodgeTimer += dt;
    
    // Check for incoming bullets and dodge
    let incomingBullet = null;
    for (let bullet of opponent.bullets) {
      const bulletDirection = side === 'left' ? -1 : 1;
      if ((bulletDirection === -1 && bullet.x < bot.x + 200) || 
          (bulletDirection === 1 && bullet.x > bot.x - 200)) {
        // Bullet is coming towards bot
        const distance = Math.abs(bullet.y - bot.y);
        if (distance < 150) {
          incomingBullet = bullet;
          break;
        }
      }
    }
    
    // Dodge incoming bullets
    if (incomingBullet && bot.aiState.dodgeTimer > 0.3) {
      const dodgeDirection = incomingBullet.y > bot.y ? -1 : 1;
      if (dodgeDirection < 0) {
        bot.moveUp = true;
        bot.moveDown = false;
      } else {
        bot.moveDown = true;
        bot.moveUp = false;
      }
      bot.aiState.dodgeTimer = 0;
    } else {
      // Change strategy every 3-5 seconds
      if (bot.aiState.strategyTimer > 3 + Math.random() * 2) {
        const strategies = ['aggressive', 'defensive', 'mirror'];
        bot.aiState.strategy = strategies[Math.floor(Math.random() * strategies.length)];
        bot.aiState.strategyTimer = 0;
      }
      
      // Execute strategy
      let targetY;
      switch (bot.aiState.strategy) {
        case 'aggressive':
          // Try to align with opponent for direct shots
          targetY = opponent.y + (Math.random() - 0.5) * 50;
          break;
        case 'defensive':
          // Move to opposite side to avoid opponent
          targetY = opponent.y > this.canvas.height / 2 ? 
                    this.canvas.height * 0.3 : 
                    this.canvas.height * 0.7;
          break;
        case 'mirror':
          // Stay at middle height
          targetY = this.canvas.height / 2 + (Math.random() - 0.5) * 100;
          break;
      }
      
      // Smooth movement towards target
      const diff = targetY - bot.y;
      const threshold = 30;
      
      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          bot.moveDown = true;
          bot.moveUp = false;
        } else {
          bot.moveUp = true;
          bot.moveDown = false;
        }
      } else {
        bot.moveUp = false;
        bot.moveDown = false;
      }
    }
    
    // Intelligent shooting - only shoot when aligned
    const verticalAlignment = Math.abs(opponent.y - bot.y);
    bot.aiState.lastShot += dt;
    
    if (bot.aiState.strategy === 'aggressive') {
      // Aggressive: shoot frequently when roughly aligned
      bot.shooting = verticalAlignment < 150 && bot.aiState.lastShot > 0.3;
    } else if (bot.aiState.strategy === 'defensive') {
      // Defensive: shoot less frequently, only when well aligned
      bot.shooting = verticalAlignment < 80 && bot.aiState.lastShot > 0.5;
    } else {
      // Mirror: moderate shooting
      bot.shooting = verticalAlignment < 100 && bot.aiState.lastShot > 0.4;
    }
    
    if (bot.shooting) {
      bot.aiState.lastShot = 0;
    }
  }
  
  fireBullet(side) {
    const player = this.players[side];
    const direction = side === 'left' ? 1 : -1;
    const baseX = player.x + (direction > 0 ? player.width / 2 : -player.width / 2);
    
    // Normal shot
    player.bullets.push({
      x: baseX,
      y: player.y,
      vx: direction * 800,
      vy: 0,
      radius: 18,
      powerUp: player.hasPowerUp
    });
    
    // Power-up: triple shot
    if (player.hasPowerUp) {
      player.bullets.push({
        x: baseX,
        y: player.y - 45,
        vx: direction * 800,
        vy: 0,
        radius: 18,
        powerUp: true
      });
      player.bullets.push({
        x: baseX,
        y: player.y + 45,
        vx: direction * 800,
        vy: 0,
        radius: 18,
        powerUp: true
      });
    }
    
    // Create muzzle flash particles
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: player.x + (direction > 0 ? player.width / 2 : -player.width / 2),
        y: player.y,
        vx: direction * (Math.random() * 100 + 50),
        vy: (Math.random() - 0.5) * 100,
        life: 0.3,
        color: player.color,
        size: Math.random() * 3 + 2
      });
    }
    
    // Send sound effect to controllers
    this.host.channel.publish('gameEvent', {
      type: 'shoot',
      side: side
    });
  }
  
  checkBulletCollision(bullet, player) {
    const dx = bullet.x - player.x;
    const dy = bullet.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (bullet.radius + Math.max(player.width, player.height) / 2);
  }
  
  onHit(shooter, victim) {
    const shooterPlayer = this.players[shooter];
    const victimPlayer = this.players[victim];
    
    // Decrease health by 10
    victimPlayer.health = Math.max(0, victimPlayer.health - 10);
    shooterPlayer.score += 10;
    
    // Update UI
    const victimNum = victim === 'left' ? '1' : '2';
    const shooterNum = shooter === 'left' ? '1' : '2';
    
    const healthBar = document.getElementById('health' + victimNum);
    healthBar.style.width = victimPlayer.health + '%';
    if (victimPlayer.health < 30) {
      healthBar.classList.add('low');
    }
    
    document.getElementById('score' + shooterNum).textContent = shooterPlayer.score;
    
    // Show hit indicator
    if (victimPlayer.health > 0) {
      this.showGameEvent(`HIT! -10 HP`);
    }
    
    // Send haptic feedback and health update to controllers
    this.host.channel.publish('gameEvent', {
      type: 'hit',
      side: victim,
      health: victimPlayer.health,
      shooterSide: shooter
    });
    
    // Screen shake effect
    this.screenShake = { intensity: 10, duration: 200 };
    
    console.log(`${shooterPlayer.name || shooter} hit ${victimPlayer.name || victim}! Health: ${victimPlayer.health}`);
  }
  
  createExplosion(x, y) {
    this.explosions.push({
      x: x,
      y: y,
      radius: 10,
      life: 0.5
    });
    
    // Create explosion particles
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 200,
        vy: Math.sin(angle) * 200,
        life: 0.8,
        color: '#fbbf24',
        size: Math.random() * 4 + 2
      });
    }
  }
  
  gameOver() {
    this.active = false;
    
    const winner = this.players.left.health > 0 ? 'left' : 'right';
    const loser = winner === 'left' ? 'right' : 'left';
    const winnerPlayer = this.players[winner];
    const loserPlayer = this.players[loser];
    
    // Show game event
    this.showGameEvent(`${winnerPlayer.name} WINS! 🏆`);
    
    // Notify players
    this.host.channel.publish('gameEnded', {
      winner: winner,
      winnerName: winnerPlayer.name,
      loserName: loserPlayer.name,
      finalScores: {
        left: this.players.left.score,
        right: this.players.right.score
      },
      finalHealth: {
        left: this.players.left.health,
        right: this.players.right.health
      }
    });
    
    // Show detailed game over screen
    setTimeout(() => {
      this.showGameOverScreen(winner, loser);
    }, 2000);
  }
  
  showGameOverScreen(winner, loser) {
    const winnerPlayer = this.players[winner];
    const loserPlayer = this.players[loser];
    
    const gameOverCard = document.getElementById('gameOverCard');
    gameOverCard.innerHTML = `
      <div class="winner-icon">🏆</div>
      <h1 style="font-size: 3em; margin-bottom: 10px; color: #10b981;">
        ${winnerPlayer.name} WINS!
      </h1>
      <p style="font-size: 1.3em; opacity: 0.8; margin-bottom: 30px;">
        ${loserPlayer.name} was defeated
      </p>
      
      <div class="stats-grid">
        <div class="stat-card winner">
          <div style="font-size: 2em; margin-bottom: 10px;">🏆</div>
          <div style="font-size: 1.5em; font-weight: 700; color: #10b981;">${winnerPlayer.name}</div>
          <div style="margin: 15px 0;">
            <div style="font-size: 0.9em; opacity: 0.7;">Score</div>
            <div style="font-size: 2em; font-weight: 900; color: #fbbf24;">${winnerPlayer.score}</div>
          </div>
          <div>
            <div style="font-size: 0.9em; opacity: 0.7;">Health Remaining</div>
            <div style="font-size: 1.5em; font-weight: 700; color: #10b981;">${winnerPlayer.health}%</div>
          </div>
        </div>
        
        <div class="stat-card loser">
          <div style="font-size: 2em; margin-bottom: 10px;">💥</div>
          <div style="font-size: 1.5em; font-weight: 700; color: #ef4444;">${loserPlayer.name}</div>
          <div style="margin: 15px 0;">
            <div style="font-size: 0.9em; opacity: 0.7;">Score</div>
            <div style="font-size: 2em; font-weight: 900; color: #fbbf24;">${loserPlayer.score}</div>
          </div>
          <div>
            <div style="font-size: 0.9em; opacity: 0.7;">Health</div>
            <div style="font-size: 1.5em; font-weight: 700; color: #ef4444;">0%</div>
          </div>
        </div>
      </div>
      
      <div class="menu-buttons" style="margin-top: 30px;">
        <button class="btn btn-primary" onclick="restartGame()">🔄 Play Again</button>
        <button class="btn btn-secondary" onclick="quitToMenu()">🚪 Back to Menu</button>
      </div>
    `;
    
    document.getElementById('gameOverScreen').classList.add('active');
  }
  
  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw stars
    ctx.fillStyle = '#fff';
    this.stars.forEach(star => {
      ctx.globalAlpha = 0.5 + star.size / 4;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1;
    
    // Draw players
    ['left', 'right'].forEach(side => {
      const player = this.players[side];
      
      // Draw power-up glow
      if (player.hasPowerUp) {
        ctx.save();
        ctx.shadowColor = player.color;
        ctx.shadowBlur = 30;
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.width, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      this.drawRocket(ctx, player, side);
      
      // Draw bullets
      player.bullets.forEach(bullet => {
        // Power-up bullets glow
        if (bullet.powerUp) {
          ctx.save();
          ctx.shadowColor = player.color;
          ctx.shadowBlur = 20;
          ctx.fillStyle = player.color;
        } else {
          ctx.fillStyle = player.color;
        }
        
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        
        if (bullet.powerUp) {
          ctx.restore();
        }
        
        // Bullet trail
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(bullet.x - bullet.vx * 0.01, bullet.y, bullet.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
    
    // Draw particles
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    
    // Draw explosions
    this.explosions.forEach(e => {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.globalAlpha = e.life;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }
  
  drawRocket(ctx, player, side) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rotation); // Add rotation animation
    
    if (side === 'right') {
      ctx.scale(-1, 1);
    }
    
    // Scale for better visibility at 100% zoom
    ctx.scale(1.5, 1.5);
    
    // Rocket body
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-10, -15);
    ctx.lineTo(-15, -15);
    ctx.lineTo(-15, 15);
    ctx.lineTo(-10, 15);
    ctx.closePath();
    ctx.fill();
    
    // Cockpit
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(10, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Wings
    ctx.fillStyle = player.color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(-10, -15);
    ctx.lineTo(-10, -25);
    ctx.lineTo(0, -15);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(-10, 15);
    ctx.lineTo(-10, 25);
    ctx.lineTo(0, 15);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Engine flame
    if (player.shooting || Math.random() > 0.5) {
      const flameLength = Math.random() * 10 + 10;
      const gradient = ctx.createLinearGradient(-15, 0, -15 - flameLength, 0);
      gradient.addColorStop(0, '#fbbf24');
      gradient.addColorStop(0.5, '#f59e0b');
      gradient.addColorStop(1, '#ef4444');
      
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(-15, -8);
      ctx.lineTo(-15 - flameLength, 0);
      ctx.lineTo(-15, 8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    ctx.restore();
  }
  
  handlePlayerAction(data) {
    const player = ['left', 'right'].find(side => 
      this.players[side].playerId === data.playerId
    );
    
    if (!player) return;
    
    const p = this.players[player];
    
    switch (data.action) {
      case 'moveUp':
        p.moveUp = data.value;
        break;
      case 'moveDown':
        p.moveDown = data.value;
        break;
      case 'shoot':
        p.shooting = data.value;
        break;
    }
  }
  
  playerDisconnected(side) {
    this.showGameEvent(`${this.players[side].name} disconnected!`);
    setTimeout(() => this.gameOver(), 2000);
  }
  
  showGameEvent(text) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'game-event';
    eventDiv.textContent = text;
    document.body.appendChild(eventDiv);
    setTimeout(() => eventDiv.remove(), 2000);
  }
}

// Global
let hostScreen;

window.addEventListener('load', () => {
  hostScreen = new SpaceShooterHost();
});

function startGame() {
  if (!hostScreen) return;
  
  const canStart = hostScreen.gameMode === 'bot' 
    ? hostScreen.players.size >= 1 
    : hostScreen.players.size >= 2;
    
  if (!canStart) {
    alert('Not enough players!');
    return;
  }
  
  document.getElementById('setupScreen').classList.add('hidden');
  setTimeout(() => {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('gameScreen').classList.add('active');
  }, 500);
  
  hostScreen.game = new SpaceShooterGame(hostScreen);
}

function pauseGame() {
  if (!hostScreen || !hostScreen.game) return;
  
  hostScreen.isPaused = true;
  hostScreen.game.active = false;
  document.getElementById('pauseMenu').classList.add('active');
  document.getElementById('pauseBtn').textContent = '▶️ Resume';
  
  // Notify players
  hostScreen.channel.publish('gameEvent', {
    type: 'paused'
  });
}

function resumeGame() {
  if (!hostScreen || !hostScreen.game) return;
  
  hostScreen.isPaused = false;
  document.getElementById('pauseMenu').classList.remove('active');
  document.getElementById('pauseBtn').textContent = '⏸️ Pause';
  
  // Restart game loop
  hostScreen.game.active = true;
  hostScreen.game.lastFrameTime = Date.now();
  hostScreen.game.startGameLoop();
  
  // Notify players
  hostScreen.channel.publish('gameEvent', {
    type: 'resumed'
  });
}

function restartGame() {
  if (!hostScreen) return;
  
  // Close all menus
  document.getElementById('pauseMenu').classList.remove('active');
  document.getElementById('gameOverScreen').classList.remove('active');
  
  // Reset and start new game
  hostScreen.game = new SpaceShooterGame(hostScreen);
  
  // Notify players that game is restarting and starting
  hostScreen.channel.publish('gameEvent', {
    type: 'restart'
  });
  
  // Send game started event so controllers know to stay connected
  setTimeout(() => {
    hostScreen.channel.publish('gameStarted', {});
  }, 500);
}

function showQuitConfirm() {
  if (confirm('Are you sure you want to quit the game? All progress will be lost.')) {
    quitToMenu();
  }
}

function quitToMenu() {
  if (hostScreen && hostScreen.game) {
    hostScreen.game.active = false;
  }
  
  // Notify players game ended
  if (hostScreen && hostScreen.channel) {
    hostScreen.channel.publish('gameEnded', {
      quit: true
    });
  }
  
  // Close all menus
  document.getElementById('pauseMenu').classList.remove('active');
  document.getElementById('gameOverScreen').classList.remove('active');
  document.getElementById('gameScreen').classList.remove('active');
  document.getElementById('setupScreen').style.display = 'flex';
  document.getElementById('setupScreen').classList.remove('hidden');
  
  // Reset player list
  if (hostScreen) {
    hostScreen.updatePlayerList();
    hostScreen.updateStartButton();
  }
}
