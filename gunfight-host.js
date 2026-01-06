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
    this.explosions = []; // Visual explosions
    this.gameStarted = false;
    this.gameMode = 'ffa'; // ffa, tdm, sniper, gunrace
    this.gameTime = 300; // 5 minutes in seconds
    this.gameTimer = null;
    
    // Power-ups (Pops)
    this.pops = [];
    this.popSpawnTimer = 0;
    
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
      primary: { name: 'Assault Rifle', damage: 25, fireRate: 75, range: 500, ammo: 250, maxAmmo: 1000 },
      secondary: { name: 'Pistol', damage: 35, fireRate: 150, range: 300, ammo: 100, maxAmmo: 500 },
      sniper: { name: 'Sniper Rifle', damage: 100, fireRate: 600, range: 1000, ammo: 50, maxAmmo: 200 }
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
    console.log('Player joining:', playerId, data);
    
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
      console.log('Player added to map. Total players:', this.players.size);
      this.updatePlayerList();
      this.updateScoreboard();
      
      // Enable start button if we have players
      if (this.players.size > 0) {
        const startBtn = document.getElementById('startGameBtn');
        if (startBtn) startBtn.disabled = false;
      }
    } else {
      console.log('Player already in game:', playerId);
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
    const speed = player.isCrouching ? 2 : 4.5;
    player.lastMoveUpdate = Date.now();
    
    if (!data.active) {
      player.vx = 0;
      player.vy = 0;
      return;
    }
    
    // The controller now sends pre-normalized and deadzone-corrected values
    const magnitude = Math.sqrt(data.x * data.x + data.y * data.y);
    
    if (magnitude === 0) {
      player.vx = 0;
      player.vy = 0;
    } else {
      // Apply a slight curve for better feel
      const curvedMag = Math.pow(magnitude, 1.2); 
      
      player.vx = (data.x / magnitude) * curvedMag * speed;
      player.vy = (data.y / magnitude) * curvedMag * speed;
    }
  }
  
  handleLook(player, data) {
    if (data.active) {
      // Use the angle provided by the controller or calculate it
      if (data.angle !== undefined) {
        player.angle = data.angle;
      } else {
        player.angle = Math.atan2(data.y, data.x);
      }
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
    
    // Play sound
    this.playShootSound();
    
    // Raycast to find hit - pass player.id to avoid self-hit
    const hit = this.raycast(player.x, player.y, player.angle, weapon.range, player.id);
    
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
  
  raycast(x, y, angle, range, firingPlayerId) {
    const endX = x + Math.cos(angle) * range;
    const endY = y + Math.sin(angle) * range;
    
    let closestHit = null;
    let closestDist = range;
    
    for (const [id, targetPlayer] of this.players) {
      if (targetPlayer.health <= 0) continue;
      
      // Don't hit yourself
      if (id === firingPlayerId) continue;

      // Distance from point (targetPlayer) to line segment (x,y to endX,endY)
      const dist = this.distToSegment(targetPlayer.x, targetPlayer.y, x, y, endX, endY);
      
      if (dist < 25) { // Player radius + small buffer
        const dX = targetPlayer.x - x;
        const dY = targetPlayer.y - y;
        const distToPlayer = Math.sqrt(dX * dX + dY * dY);
        
        if (distToPlayer < closestDist) {
          closestHit = { player: targetPlayer, distance: distToPlayer };
          closestDist = distToPlayer;
        }
      }
    }
    
    return closestHit;
  }

  distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2);
  }
  
  damagePlayer(player, damage, attacker) {
    // Don't damage yourself with bullets (grenades might still hit you)
    if (player.id === attacker.id && damage < 50) { // Bullets do < 50, grenades do more
      return;
    }

    // Friendly fire check
    if (this.gameMode === 'tdm' && player.team === attacker.team) {
      return;
    }

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
      this.triggerFlash('rgba(255, 0, 0, 0.4)');
      
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
    
    // Add visual explosion
    this.explosions.push({
      x: player.x + Math.cos(player.angle) * 100, // Throw it forward a bit
      y: player.y + Math.sin(player.angle) * 100,
      radius: explosionRadius,
      time: Date.now()
    });

    const expX = player.x + Math.cos(player.angle) * 100;
    const expY = player.y + Math.sin(player.angle) * 100;
    
    // Damage players in radius
    for (const [id, targetPlayer] of this.players) {
      const dx = targetPlayer.x - expX;
      const dy = targetPlayer.y - expY;
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
    
    // Update host UI
    this.updateScoreboard();
  }
  
  updatePlayerList() {
    const playerList = document.getElementById('playerList');
    
    let html = `<h3>Players Connected: <span id="playerCount">${this.players.size}</span></h3>`;
    
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

    // Notify players
    this.channel.publish('game-over', {
      winnerId: winner ? winner.id : null,
      winnerName: winner ? winner.name : null
    });
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
    
    // Continue loop
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    // Remove old bullet tracers (keep for 100ms)
    const now = Date.now();
    this.bullets = this.bullets.filter(bullet => now - bullet.time < 100);
    this.explosions = this.explosions.filter(exp => now - exp.time < 500);

    const dt = 1/60; // Approximate dt

    // Spawn Power-ups
    this.popSpawnTimer += dt;
    if (this.popSpawnTimer > 10) { // Every 10 seconds
      this.spawnPop();
      this.popSpawnTimer = 0;
    }
    
    // Update all players
    for (const [id, player] of this.players) {
      if (player.health <= 0) continue;

      // Stop player if no movement update received for a while (timeout)
      if (player.lastMoveUpdate && now - player.lastMoveUpdate > 300) {
        player.vx *= 0.5;
        player.vy *= 0.5;
        if (Math.abs(player.vx) < 0.1) player.vx = 0;
        if (Math.abs(player.vy) < 0.1) player.vy = 0;
      }

      // Try moving in X
      const oldX = player.x;
      player.x += player.vx;
      
      // Keep in bounds X
      player.x = Math.max(20, Math.min(this.arena.width - 20, player.x));
      
      // Check collision with obstacles in X
      for (const obstacle of this.arena.obstacles) {
        if (this.checkCollision(player, obstacle)) {
          player.x = oldX;
          break;
        }
      }

      // Try moving in Y
      const oldY = player.y;
      player.y += player.vy;
      
      // Keep in bounds Y
      player.y = Math.max(20, Math.min(this.arena.height - 20, player.y));
      
      // Check collision with obstacles in Y
      for (const obstacle of this.arena.obstacles) {
        if (this.checkCollision(player, obstacle)) {
          player.y = oldY;
          break;
        }
      }
      
      // Check collision with pops
      this.pops = this.pops.filter(pop => {
        const dx = player.x - pop.x;
        const dy = player.y - pop.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 40) { // Pickup radius
          this.applyPop(player, pop);
          return false;
        }
        return true;
      });
    }
  }

  spawnPop() {
    const types = ['health', 'ammo'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.pops.push({
      x: Math.random() * (this.arena.width - 200) + 100,
      y: Math.random() * (this.arena.height - 200) + 100,
      type: type,
      time: Date.now()
    });
  }

  applyPop(player, pop) {
    if (pop.type === 'health') {
      player.health = Math.min(100, player.health + 40);
      this.triggerFlash('rgba(0, 255, 0, 0.2)');
    } else if (pop.type === 'ammo') {
      player.maxAmmo += 200;
      this.triggerFlash('rgba(255, 255, 0, 0.2)');
    }
    
    // Pulse HUD
    player.isPoweredUp = true;
    setTimeout(() => {
      player.isPoweredUp = false;
      this.updatePlayerStatsHUD();
    }, 2000);

    this.updatePlayerState(player);
    this.playShootSound(); // Use some sound
    this.updatePlayerStatsHUD();
    
    this.showGameEvent(`${player.name} PICKED UP ${pop.type.toUpperCase()}!`);
  }

  showGameEvent(text) {
    const gameHud = document.getElementById('gameHud');
    const message = document.createElement('div');
    message.className = 'game-message';
    message.style.fontSize = '2em';
    message.textContent = text;
    gameHud.appendChild(message);
    
    setTimeout(() => message.remove(), 2000);
  }
  
  checkCollision(player, obstacle) {
    const radius = 20;
    // Closest point on rectangle to circle center
    const closestX = Math.max(obstacle.x, Math.min(player.x, obstacle.x + obstacle.width));
    const closestY = Math.max(obstacle.y, Math.min(player.y, obstacle.y + obstacle.height));
    
    const dx = player.x - closestX;
    const dy = player.y - closestY;
    
    return (dx * dx + dy * dy) < (radius * radius);
  }

  playShootSound() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(150, this.audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(40, this.audioCtx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(this.audioCtx.currentTime + 0.1);
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
    
    // Clamp camera to arena bounds to prevent showing "the void"
    const halfWidth = canvas.width / 2;
    const halfHeight = canvas.height / 2;
    
    // Only clamp if arena is larger than canvas
    if (this.arena.width > canvas.width) {
      camX = Math.max(halfWidth, Math.min(this.arena.width - halfWidth, camX));
    } else {
      camX = this.arena.width / 2;
    }
    
    if (this.arena.height > canvas.height) {
      camY = Math.max(halfHeight, Math.min(this.arena.height - halfHeight, camY));
    } else {
      camY = this.arena.height / 2;
    }
    
    // Transform to world space
    ctx.save();
    ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);
    
    // Draw arena floor
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, this.arena.width, this.arena.height);

    // Draw arena border (Solid walls)
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 10;
    ctx.strokeRect(-5, -5, this.arena.width + 10, this.arena.height + 10);
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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

    // Draw Power-ups (Pops)
    for (const pop of this.pops) {
      const pulse = Math.sin(Date.now() / 200) * 5;
      const color = pop.type === 'health' ? '#4ade80' : '#fbbf24';
      
      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pop.x, pop.y, 15 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Icon
      ctx.fillStyle = 'white';
      if (pop.type === 'health') {
        const size = 10;
        ctx.fillRect(pop.x - size, pop.y - 2, size * 2, 4);
        ctx.fillRect(pop.x - 2, pop.y - size, 4, size * 2);
      } else {
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('A', pop.x, pop.y);
      }
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

    // Draw explosions
    for (const exp of this.explosions) {
      const age = Date.now() - exp.time;
      const pct = age / 500;
      const radius = exp.radius * (0.5 + pct * 0.5);
      const opacity = 1 - pct;
      
      ctx.fillStyle = `rgba(255, 100, 0, ${opacity * 0.6})`;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = `rgba(255, 200, 0, ${opacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
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

    this.updatePlayerStatsHUD();
  }

  updatePlayerStatsHUD() {
    const statsContainer = document.getElementById('playerStats');
    if (!statsContainer) return;

    let html = '';
    for (const [id, player] of this.players) {
      const weapon = this.weapons[player.weapon];
      const isLowHealth = player.health < 30;
      
      html += `
        <div class="stat-card ${player.isPoweredUp ? 'active-power' : ''}">
          <div class="player-name" style="color: ${player.color}">${player.name}</div>
          <div class="health-container">
            <div class="health-bar">
              <div class="health-fill ${isLowHealth ? 'low' : ''}" style="width: ${player.health}%"></div>
            </div>
            <div class="stat-row">
              <span>HP</span>
              <span>${Math.ceil(player.health)}/100</span>
            </div>
          </div>
          <div class="stat-row">
            <span>Ammo</span>
            <span>${player.ammo} / ${player.maxAmmo}</span>
          </div>
        </div>
      `;
    }
    statsContainer.innerHTML = html;
  }
  
  addKillFeed(killerName, victimName) {
    const killFeed = document.getElementById('killFeed');
    
    const killItem = document.createElement('div');
    killItem.className = 'kill-item kill-feed-anim';
    killItem.innerHTML = `<span style="color:#ffaa00">${killerName}</span> <span style="color: #ff4444; margin: 0 5px;">[💀]</span> ${victimName}`;
    
    killFeed.insertBefore(killItem, killFeed.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
      killItem.style.opacity = '0';
      killItem.style.transform = 'translateX(20px)';
      killItem.style.transition = 'all 0.5s';
      setTimeout(() => killItem.remove(), 500);
    }, 5000);
    
    // Keep only last 5 kills
    while (killFeed.children.length > 5) {
      killFeed.lastChild.remove();
    }
  }

  triggerFlash(color) {
    const flash = document.getElementById('screenFlash');
    if (flash) {
      flash.style.background = color || 'white';
      flash.classList.remove('active');
      void flash.offsetWidth; // trigger reflow
      flash.classList.add('active');
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
