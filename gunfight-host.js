// Gun Fight Host Game Logic
class GunFightHost {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.roomCode = null;
    
    // Game state
    this.players = new Map();
    this.bullets = []; // Visual bullet tracers
    this.gameStarted = false;
    this.gameMode = 'ffa'; // ffa, tdm, sniper, gunrace
    this.gameTime = 300; // 5 minutes in seconds
    this.gameTimer = null;
    
    // Canvas
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Map/Arena
    this.arena = {
      width: 2000,
      height: 2000,
      obstacles: []
    };
    
    // Weapons
    this.weapons = {
      primary: { name: 'Assault Rifle', damage: 25, fireRate: 100, range: 500, ammo: 30, maxAmmo: 120 },
      secondary: { name: 'Pistol', damage: 35, fireRate: 200, range: 300, ammo: 15, maxAmmo: 75 },
      sniper: { name: 'Sniper Rifle', damage: 100, fireRate: 800, range: 1000, ammo: 5, maxAmmo: 25 }
    };
    
    this.init();
  }
  
  async init() {
    // Load config from Vercel environment if deployed
    await CONFIG.loadFromEnvironment();
    
    // Setup canvas
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Generate room code
    this.roomCode = this.roomManager.generateRoomCode();
    document.getElementById('roomCode').textContent = this.roomCode;
    
    // Setup Ably connection
    await this.setupAbly();
    
    // Generate QR code and URL
    this.generateControllerLink();
    
    // Setup game mode selection
    this.setupGameModes();
    
    // Setup start button
    document.getElementById('startGameBtn').addEventListener('click', () => {
      this.startGame();
    });
    
    // Generate arena obstacles
    this.generateArena();
  }
  
  async setupAbly() {
    try {
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      
      this.ably.connection.on('connected', () => {
        console.log('Host connected to Ably');
      });
      
      const channelName = `gunfight-${this.roomCode}`;
      this.channel = this.ably.channels.get(channelName);
      
      // Subscribe to player events
      this.channel.subscribe('player-joined', (message) => {
        this.handlePlayerJoined(message.data);
      });
      
      this.channel.subscribe('controller-input', (message) => {
        this.handleControllerInput(message.data);
      });
      
      console.log(`Gun Fight room created: ${this.roomCode}`);
      
    } catch (error) {
      console.error('Failed to setup Ably:', error);
      alert('Failed to create game room. Please refresh and try again.');
    }
  }
  
  generateControllerLink() {
    const baseURL = window.location.origin + window.location.pathname.replace('gunfight-host.html', '');
    const controllerURL = `${baseURL}gunfight-controller.html?join=${this.roomCode}`;
    
    document.getElementById('controllerURL').textContent = controllerURL;
    
    // Generate QR code
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: controllerURL,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff'
    });
  }
  
  setupGameModes() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.gameMode = btn.dataset.mode;
      });
    });
  }
  
  handlePlayerJoined(data) {
    const { playerId } = data;
    
    if (!this.players.has(playerId)) {
      const player = {
        id: playerId,
        name: `Player ${this.players.size + 1}`,
        x: Math.random() * 1000 + 500,
        y: Math.random() * 1000 + 500,
        angle: 0,
        vx: 0,
        vy: 0,
        health: 100,
        maxHealth: 100,
        weapon: 'primary',
        ammo: this.weapons.primary.ammo,
        maxAmmo: this.weapons.primary.maxAmmo,
        score: 0,
        kills: 0,
        deaths: 0,
        isCrouching: false,
        isAiming: false,
        lastFired: 0,
        team: this.gameMode === 'tdm' ? (this.players.size % 2 === 0 ? 'red' : 'blue') : null,
        color: this.gameMode === 'tdm' ? (this.players.size % 2 === 0 ? '#ff4444' : '#4444ff') : '#ffaa00'
      };
      
      this.players.set(playerId, player);
      this.updatePlayerList();
      
      // Enable start button if we have players
      if (this.players.size > 0) {
        document.getElementById('startGameBtn').disabled = false;
      }
    }
  }
  
  handleControllerInput(data) {
    const { playerId, type, action, value, data: inputData } = data;
    const player = this.players.get(playerId);
    
    if (!player) {
      console.warn('Player not found:', playerId);
      return;
    }
    
    if (!this.gameStarted) {
      console.warn('Game not started yet, ignoring input');
      return;
    }
    
    switch (type) {
      case 'move':
        this.handleMove(player, inputData);
        break;
      case 'look':
        this.handleLook(player, inputData);
        break;
      case 'action':
        this.handleAction(player, action, value);
        break;
    }
  }
  
  handleMove(player, data) {
    const speed = player.isCrouching ? 3 : 6;
    const acceleration = 0.3;
    
    // Smooth acceleration instead of instant velocity
    const targetVx = data.x * speed;
    const targetVy = data.y * speed;
    
    player.vx += (targetVx - player.vx) * acceleration;
    player.vy += (targetVy - player.vy) * acceleration;
    
    // Apply friction when not moving
    if (Math.abs(data.x) < 0.1 && Math.abs(data.y) < 0.1) {
      player.vx *= 0.85;
      player.vy *= 0.85;
    }
  }
  
  handleLook(player, data) {
    if (data.active) {
      // Convert joystick input to angle
      const angle = Math.atan2(data.y, data.x);
      player.angle = angle;
    }
  }
  
  handleAction(player, action, value) {
    switch (action) {
      case 'fire':
        if (value) this.playerFire(player);
        break;
      case 'jump':
        // Jump logic (could add jump animation)
        break;
      case 'reload':
        this.playerReload(player);
        break;
      case 'grenade':
        this.playerThrowGrenade(player);
        break;
      case 'crouch':
        player.isCrouching = value;
        break;
      case 'medkit':
        this.playerUseMedkit(player);
        break;
      case 'switchWeapon':
        this.playerSwitchWeapon(player, value);
        break;
    }
  }
  
  playerFire(player) {
    const now = Date.now();
    const weapon = this.weapons[player.weapon];
    
    // Check fire rate
    if (now - player.lastFired < weapon.fireRate) return;
    
    // Check ammo
    if (player.ammo <= 0) return;
    
    player.lastFired = now;
    player.ammo--;
    
    // Raycast to find hit
    const hit = this.raycast(player.x, player.y, player.angle, weapon.range);
    
    // Create bullet tracer for visual effect
    const endX = player.x + Math.cos(player.angle) * weapon.range;
    const endY = player.y + Math.sin(player.angle) * weapon.range;
    
    const bulletEndX = hit && hit.player ? hit.player.x : endX;
    const bulletEndY = hit && hit.player ? hit.player.y : endY;
    
    // Add bullet tracer
    this.bullets.push({
      startX: player.x,
      startY: player.y,
      endX: bulletEndX,
      endY: bulletEndY,
      time: Date.now(),
      playerId: player.id
    });
    
    if (hit && hit.player) {
      // Hit another player
      this.damagePlayer(hit.player, weapon.damage, player);
    }
    
    // Update player ammo
    this.updatePlayerState(player);
  }
  
  raycast(x, y, angle, range) {
    const endX = x + Math.cos(angle) * range;
    const endY = y + Math.sin(angle) * range;
    
    // Check for player hits
    let closestHit = null;
    let closestDist = range;
    
    for (const [id, targetPlayer] of this.players) {
      if (targetPlayer.health <= 0) continue;
      
      // Simple circle collision for players
      const dx = targetPlayer.x - x;
      const dy = targetPlayer.y - y;
      const distToPlayer = Math.sqrt(dx * dx + dy * dy);
      
      // Check if player is in line of fire
      const angleToPlayer = Math.atan2(dy, dx);
      const angleDiff = Math.abs(angle - angleToPlayer);
      
      if (angleDiff < 0.1 && distToPlayer < closestDist) {
        closestHit = { player: targetPlayer, distance: distToPlayer };
        closestDist = distToPlayer;
      }
    }
    
    return closestHit;
  }
  
  damagePlayer(player, damage, attacker) {
    player.health -= damage;
    
    // Show hit marker to attacker
    this.channel.publish('game-state', {
      playerId: attacker.id,
      event: 'hit',
      damage: damage
    });
    
    if (player.health <= 0) {
      // Player died
      player.health = 0;
      player.deaths++;
      attacker.kills++;
      attacker.score += 100;
      
      // Publish kill event
      this.channel.publish('player-update', {
        event: 'kill',
        killerId: attacker.id,
        killerName: attacker.name,
        playerId: player.id,
        playerName: player.name
      });
      
      // Add to kill feed
      this.addKillFeed(attacker.name, player.name);
      
      // Respawn player after delay
      setTimeout(() => {
        this.respawnPlayer(player);
      }, 3000);
    }
    
    // Update both players
    this.updatePlayerState(player);
    this.updatePlayerState(attacker);
  }
  
  respawnPlayer(player) {
    player.health = player.maxHealth;
    player.x = Math.random() * 1000 + 500;
    player.y = Math.random() * 1000 + 500;
    player.ammo = this.weapons[player.weapon].ammo;
    
    this.updatePlayerState(player);
  }
  
  playerReload(player) {
    const weapon = this.weapons[player.weapon];
    const ammoNeeded = weapon.ammo - player.ammo;
    const ammoAvailable = Math.min(ammoNeeded, player.maxAmmo);
    
    player.ammo = Math.min(weapon.ammo, player.ammo + ammoAvailable);
    player.maxAmmo -= ammoAvailable;
    
    this.updatePlayerState(player);
  }
  
  playerThrowGrenade(player) {
    // Create grenade explosion area
    const explosionRadius = 150;
    
    // Damage players in radius
    for (const [id, targetPlayer] of this.players) {
      if (targetPlayer.id === player.id) continue;
      
      const dx = targetPlayer.x - player.x;
      const dy = targetPlayer.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < explosionRadius) {
        const damage = Math.max(0, 80 - (dist / explosionRadius) * 60);
        this.damagePlayer(targetPlayer, damage, player);
      }
    }
  }
  
  playerUseMedkit(player) {
    if (player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + 50);
      this.updatePlayerState(player);
    }
  }
  
  playerSwitchWeapon(player, weaponType) {
    if (this.weapons[weaponType]) {
      player.weapon = weaponType;
      player.ammo = this.weapons[weaponType].ammo;
      this.updatePlayerState(player);
    }
  }
  
  updatePlayerState(player) {
    this.channel.publish('game-state', {
      playerId: player.id,
      health: player.health,
      ammo: player.ammo,
      maxAmmo: player.maxAmmo,
      score: player.score,
      kills: player.kills,
      deaths: player.deaths
    });
  }
  
  updatePlayerList() {
    const playerList = document.getElementById('playerList');
    const playerCount = document.getElementById('playerCount');
    
    playerCount.textContent = this.players.size;
    
    let html = '<h3>Players Connected: ' + this.players.size + '</h3>';
    
    for (const [id, player] of this.players) {
      html += `
        <div class="player-item">
          <span>👤 ${player.name}</span>
          <span style="color: ${player.color}">⚡ Ready</span>
        </div>
      `;
    }
    
    playerList.innerHTML = html;
  }
  
  startGame() {
    this.gameStarted = true;
    
    // Hide setup screen
    document.getElementById('setupScreen').classList.add('hidden');
    
    // Show game HUD
    document.getElementById('gameHud').classList.remove('hidden');
    
    // Notify all players
    this.channel.publish('game-start', {
      mode: this.gameMode,
      timestamp: Date.now()
    });
    
    // Start game loop
    this.gameLoop();
    
    // Start timer
    this.startGameTimer();
  }
  
  startGameTimer() {
    this.gameTimer = setInterval(() => {
      this.gameTime--;
      
      const minutes = Math.floor(this.gameTime / 60);
      const seconds = this.gameTime % 60;
      document.getElementById('gameTimer').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      if (this.gameTime <= 0) {
        this.endGame();
      }
    }, 1000);
  }
  
  endGame() {
    clearInterval(this.gameTimer);
    this.gameStarted = false;
    
    // Find winner
    let winner = null;
    let maxScore = -1;
    
    for (const [id, player] of this.players) {
      if (player.score > maxScore) {
        maxScore = player.score;
        winner = player;
      }
    }
    
    // Show game over message
    const gameHud = document.getElementById('gameHud');
    const message = document.createElement('div');
    message.className = 'game-message';
    message.textContent = winner ? `🏆 ${winner.name} WINS! 🏆` : 'GAME OVER';
    gameHud.appendChild(message);
  }
  
  generateArena() {
    // Create random obstacles/cover
    for (let i = 0; i < 20; i++) {
      this.arena.obstacles.push({
        x: Math.random() * 1800 + 100,
        y: Math.random() * 1800 + 100,
        width: Math.random() * 100 + 50,
        height: Math.random() * 100 + 50,
        type: 'crate'
      });
    }
  }
  
  gameLoop() {
    if (!this.gameStarted) return;
    
    // Update game state
    this.update();
    
    // Render game
    this.render();
    
    // Update scoreboard
    this.updateScoreboard();
    
    // Continue loop
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    // Remove old bullet tracers (keep for 100ms)
    const now = Date.now();
    this.bullets = this.bullets.filter(bullet => now - bullet.time < 100);
    
    // Update all players
    for (const [id, player] of this.players) {
      // Update position
      player.x += player.vx;
      player.y += player.vy;
      
      // Keep in bounds
      player.x = Math.max(50, Math.min(this.arena.width - 50, player.x));
      player.y = Math.max(50, Math.min(this.arena.height - 50, player.y));
      
      // Check collision with obstacles
      for (const obstacle of this.arena.obstacles) {
        if (this.checkCollision(player, obstacle)) {
          // Push player out
          player.x -= player.vx;
          player.y -= player.vy;
        }
      }
    }
  }
  
  checkCollision(player, obstacle) {
    const playerSize = 30;
    return player.x < obstacle.x + obstacle.width &&
           player.x + playerSize > obstacle.x &&
           player.y < obstacle.y + obstacle.height &&
           player.y + playerSize > obstacle.y;
  }
  
  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate camera position (follow first player or center)
    let camX = this.arena.width / 2;
    let camY = this.arena.height / 2;
    
    if (this.players.size > 0) {
      const firstPlayer = Array.from(this.players.values())[0];
      camX = firstPlayer.x;
      camY = firstPlayer.y;
    }
    
    // Transform to world space
    ctx.save();
    ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);
    
    // Draw arena border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, this.arena.width, this.arena.height);
    
    // Draw grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.arena.width; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.arena.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.arena.height; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.arena.width, y);
      ctx.stroke();
    }
    
    // Draw obstacles
    for (const obstacle of this.arena.obstacles) {
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
    
    // Draw bullet tracers
    for (const bullet of this.bullets) {
      const age = Date.now() - bullet.time;
      const opacity = 1 - (age / 100); // Fade out over 100ms
      
      ctx.strokeStyle = `rgba(255, 255, 0, ${opacity})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255, 255, 0, 0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(bullet.startX, bullet.startY);
      ctx.lineTo(bullet.endX, bullet.endY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // Draw players
    for (const [id, player] of this.players) {
      if (player.health <= 0) continue;
      
      // Draw player body
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw direction indicator
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(
        player.x + Math.cos(player.angle) * 30,
        player.y + Math.sin(player.angle) * 30
      );
      ctx.stroke();
      
      // Draw name
      ctx.fillStyle = 'white';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(player.name, player.x, player.y - 30);
      
      // Draw health bar
      const barWidth = 40;
      const barHeight = 5;
      ctx.fillStyle = 'red';
      ctx.fillRect(player.x - barWidth/2, player.y + 25, barWidth, barHeight);
      ctx.fillStyle = 'green';
      ctx.fillRect(player.x - barWidth/2, player.y + 25, barWidth * (player.health / player.maxHealth), barHeight);
    }
    
    ctx.restore();
  }
  
  updateScoreboard() {
    const scoreList = document.getElementById('scoreList');
    
    // Sort players by score
    const sortedPlayers = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score);
    
    let html = '';
    sortedPlayers.forEach((player, index) => {
      html += `
        <div class="score-item">
          <span>${index + 1}. ${player.name}</span>
          <span style="color: #ffaa00">${player.score}</span>
        </div>
      `;
    });
    
    scoreList.innerHTML = html;
  }
  
  addKillFeed(killerName, victimName) {
    const killFeed = document.getElementById('killFeed');
    
    const killItem = document.createElement('div');
    killItem.className = 'kill-item';
    killItem.innerHTML = `${killerName} <span style="color: #ff4444">💀</span> ${victimName}`;
    
    killFeed.insertBefore(killItem, killFeed.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
      killItem.remove();
    }, 5000);
    
    // Keep only last 5 kills
    while (killFeed.children.length > 5) {
      killFeed.lastChild.remove();
    }
  }
  
  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
  new GunFightHost();
});
