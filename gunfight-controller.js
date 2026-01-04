// Gun Fight Controller Logic
class GunFightController {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = 'player-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.playerTeam = null;
    this.isConnected = false;
    this.gameStarted = false;
    
    // Player state
    this.health = 100;
    this.ammo = 30;
    this.maxAmmo = 120;
    this.score = 0;
    this.currentWeapon = 'primary';
    this.isCrouching = false;
    this.isAiming = false;
    
    // Joystick state
    this.moveJoystick = { x: 0, y: 0, active: false };
    this.lookJoystick = { x: 0, y: 0, active: false };
    
    // Touch tracking
    this.activeTouches = new Map();
    
    this.init();
  }
  
  init() {
    // Check for room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
      const input = document.getElementById('roomCodeInput');
      input.value = joinCode.toUpperCase();
      
      // Auto-join after brief delay
      setTimeout(() => {
        console.log('Auto-joining room:', joinCode);
        this.joinGame(joinCode.toUpperCase());
      }, 500);
      
      return; // Skip setting up manual join button handlers during auto-join
    }
    
    // Auto-uppercase room code input
    document.getElementById('roomCodeInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
    
    // Join button
    document.getElementById('joinBtn').addEventListener('click', () => {
      const code = document.getElementById('roomCodeInput').value.trim();
      if (code.length === 4) {
        this.joinGame(code);
      } else {
        alert('Please enter a 4-letter room code');
      }
    });
  }
  
  async joinGame(code) {
    try {
      console.log('Connecting to gun fight room:', code);
      
      // Load config from Vercel environment if deployed
      await CONFIG.loadFromEnvironment();
      
      // Connect to Ably
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      
      // Join the room channel
      const channelName = `gunfight-${code}`;
      this.channel = this.ably.channels.get(channelName);
      
      // Subscribe to game messages
      this.channel.subscribe('game-state', (message) => {
        this.handleGameState(message.data);
      });
      
      this.channel.subscribe('game-start', (message) => {
        this.handleGameStart(message.data);
      });
      
      this.channel.subscribe('player-update', (message) => {
        this.handlePlayerUpdate(message.data);
      });
      
      // Wait for connection, then announce player joined
      this.ably.connection.on('connected', () => {
        console.log('Connected to Ably, joining room:', code);
        
        setTimeout(() => {
          console.log('Sending player-joined for:', this.playerId);
          this.channel.publish('player-joined', {
            playerId: this.playerId,
            timestamp: Date.now()
          });
        }, 500);
      });
      
      this.isConnected = true;
      
      // Switch to waiting screen
      document.getElementById('joinScreen').classList.remove('active');
      document.getElementById('waitingScreen').classList.add('active');
      document.getElementById('connectedRoom').textContent = code.toUpperCase();
      
    } catch (error) {
      console.error('Failed to join game:', error);
      alert('Failed to join game. Please check the room code and try again.');
    }
  }
  
  handleGameStart(data) {
    this.gameStarted = true;
    this.playerTeam = data.team || null;
    
    // Switch to controller screen
    document.getElementById('waitingScreen').classList.remove('active');
    document.getElementById('controllerScreen').classList.add('active');
    
    // Setup controls NOW that the screen is visible
    this.setupControllers();
    
    // Vibrate on game start
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    
    this.showNotification('🎮 Battle Started!');
  }
  
  handleGameState(data) {
    if (data.playerId === this.playerId) {
      // Update player stats
      if (data.health !== undefined) {
        this.health = data.health;
        this.updateHealthBar();
      }
      
      if (data.ammo !== undefined) {
        this.ammo = data.ammo;
        this.updateAmmo();
      }
      
      if (data.score !== undefined) {
        this.score = data.score;
        document.getElementById('score').textContent = this.score;
      }
    }
  }
  
  handlePlayerUpdate(data) {
    // Handle other player updates (kills, deaths, etc.)
    if (data.event === 'kill' && data.killerId === this.playerId) {
      this.showNotification('💀 KILL! +100');
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
    }
    
    if (data.event === 'death' && data.playerId === this.playerId) {
      this.showNotification('☠️ You died!');
      if (navigator.vibrate) {
        navigator.vibrate([100, 100, 100, 100, 100]);
      }
    }
  }
  
  setupControllers() {
    // Movement Joystick
    this.setupJoystick('moveJoystick', 'moveStick', (data) => {
      this.moveJoystick = data;
      this.sendMovement();
    });
    
    // Look Joystick
    this.setupJoystick('lookJoystick', 'lookStick', (data) => {
      this.lookJoystick = data;
      this.sendLook();
    });
    
    // Fire Button
    const fireBtn = document.getElementById('fireButton');
    this.setupButton(fireBtn, () => {
      this.fire();
    }, () => {
      // On hold - continuous fire
    });
    
    // Jump Button
    const jumpBtn = document.getElementById('jumpBtn');
    this.setupButton(jumpBtn, () => {
      this.jump();
    });
    
    // Reload Button
    const reloadBtn = document.getElementById('reloadBtn');
    this.setupButton(reloadBtn, () => {
      this.reload();
    });
    
    // Grenade Button
    const grenadeBtn = document.getElementById('grenadeBtn');
    this.setupButton(grenadeBtn, () => {
      this.throwGrenade();
    });
    
    // Crouch Button
    const crouchBtn = document.getElementById('crouchBtn');
    this.setupToggleButton(crouchBtn, (active) => {
      this.isCrouching = active;
      this.sendAction('crouch', active);
      crouchBtn.style.background = active ? 'rgba(100,100,255,0.5)' : 'rgba(100,100,255,0.2)';
    });
    
    // Medkit Button
    const medkitBtn = document.getElementById('medkitBtn');
    this.setupButton(medkitBtn, () => {
      this.useMedkit();
    });
    
    // Weapon Switch
    document.querySelectorAll('.weapon-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const weapon = slot.dataset.weapon;
        this.switchWeapon(weapon);
      });
    });
  }
  
  setupJoystick(containerId, stickId, callback) {
    const container = document.getElementById(containerId);
    const stick = document.getElementById(stickId);
    
    const maxDistance = 35; // Maximum distance from center (adjusted for smaller joystick)
    let startX, startY, centerX, centerY;
    let isActive = false;
    
    const handleStart = (e) => {
      e.preventDefault();
      
      isActive = true;
      const touch = e.touches ? e.touches[0] : e;
      const rect = container.getBoundingClientRect();
      
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      startX = touch.clientX;
      startY = touch.clientY;
      
      // Track this touch
      const touchId = e.touches ? e.touches[0].identifier : 'mouse';
      this.activeTouches.set(touchId, containerId);
    };
    
    const handleMove = (e) => {
      e.preventDefault();
      
      if (!isActive) return;
      
      const touch = e.touches ? e.touches[0] : e;
      const touchId = e.touches ? e.touches[0].identifier : 'mouse';
      
      // Only handle if this touch started on this joystick
      if (this.activeTouches.get(touchId) !== containerId) return;
      
      const deltaX = touch.clientX - centerX;
      const deltaY = touch.clientY - centerY;
      
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const angle = Math.atan2(deltaY, deltaX);
      
      const limitedDistance = Math.min(distance, maxDistance);
      const x = Math.cos(angle) * limitedDistance;
      const y = Math.sin(angle) * limitedDistance;
      
      stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      
      // Normalize values
      const normalizedX = x / maxDistance;
      const normalizedY = y / maxDistance;
      
      // Apply deadzone to prevent drift from tiny movements
      const deadzone = 0.15;
      const magnitude = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
      
      let finalX = normalizedX;
      let finalY = normalizedY;
      
      if (magnitude < deadzone) {
        finalX = 0;
        finalY = 0;
      }
      
      callback({
        x: finalX,
        y: finalY,
        active: magnitude >= deadzone,
        distance: limitedDistance / maxDistance
      });
    };
    
    const handleEnd = (e) => {
      e.preventDefault();
      
      isActive = false;
      const touchId = e.changedTouches ? e.changedTouches[0].identifier : 'mouse';
      
      // Only handle if this touch was on this joystick
      if (this.activeTouches.get(touchId) !== containerId) return;
      
      this.activeTouches.delete(touchId);
      
      stick.style.transform = 'translate(-50%, -50%)';
      
      callback({
        x: 0,
        y: 0,
        active: false,
        distance: 0
      });
    };
    
    // Touch events
    container.addEventListener('touchstart', handleStart, { passive: false });
    container.addEventListener('touchmove', handleMove, { passive: false });
    container.addEventListener('touchend', handleEnd, { passive: false });
    
    // Mouse events for testing
    container.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', (e) => {
      if (this.activeTouches.has('mouse') && this.activeTouches.get('mouse') === containerId) {
        handleMove(e);
      }
    });
    document.addEventListener('mouseup', handleEnd);
  }
  
  setupButton(button, onPress, onHold) {
    let holdTimer = null;
    let isHolding = false;
    
    const handleStart = (e) => {
      e.preventDefault();
      onPress();
      
      if (onHold) {
        holdTimer = setInterval(() => {
          isHolding = true;
          onHold();
        }, 100);
      }
    };
    
    const handleEnd = (e) => {
      e.preventDefault();
      if (holdTimer) {
        clearInterval(holdTimer);
        holdTimer = null;
      }
      isHolding = false;
    };
    
    button.addEventListener('touchstart', handleStart, { passive: false });
    button.addEventListener('touchend', handleEnd, { passive: false });
    button.addEventListener('mousedown', handleStart);
    button.addEventListener('mouseup', handleEnd);
  }
  
  setupToggleButton(button, callback) {
    let isActive = false;
    
    const toggle = (e) => {
      e.preventDefault();
      isActive = !isActive;
      callback(isActive);
    };
    
    button.addEventListener('click', toggle);
  }
  
  sendMovement() {
    if (!this.isConnected || !this.gameStarted) {
      console.log('Cannot send movement - connected:', this.isConnected, 'gameStarted:', this.gameStarted);
      return;
    }
    
    console.log('Sending movement:', this.moveJoystick);
    
    this.channel.publish('controller-input', {
      playerId: this.playerId,
      type: 'move',
      data: {
        x: this.moveJoystick.x,
        y: this.moveJoystick.y,
        active: this.moveJoystick.active
      },
      timestamp: Date.now()
    });
  }
  
  sendLook() {
    if (!this.isConnected || !this.gameStarted) return;
    
    this.channel.publish('controller-input', {
      playerId: this.playerId,
      type: 'look',
      data: {
        x: this.lookJoystick.x,
        y: this.lookJoystick.y,
        active: this.lookJoystick.active
      },
      timestamp: Date.now()
    });
  }
  
  sendAction(action, value) {
    if (!this.isConnected || !this.gameStarted) return;
    
    this.channel.publish('controller-input', {
      playerId: this.playerId,
      type: 'action',
      action: action,
      value: value,
      timestamp: Date.now()
    });
  }
  
  fire() {
    if (this.ammo <= 0) {
      this.showNotification('⚠️ Out of ammo! Reload!');
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      return;
    }
    
    this.sendAction('fire', true);
    
    // Vibration feedback
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
    
    // Decrease ammo (will be synced from host)
    this.ammo = Math.max(0, this.ammo - 1);
    this.updateAmmo();
  }
  
  jump() {
    this.sendAction('jump', true);
    
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
  
  reload() {
    this.sendAction('reload', true);
    this.showNotification('🔄 Reloading...');
    
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  }
  
  throwGrenade() {
    this.sendAction('grenade', true);
    this.showNotification('💣 Grenade!');
    
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }
  
  useMedkit() {
    this.sendAction('medkit', true);
    this.showNotification('💊 Using medkit...');
    
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  }
  
  switchWeapon(weaponType) {
    this.currentWeapon = weaponType;
    this.sendAction('switchWeapon', weaponType);
    
    // Update UI
    document.querySelectorAll('.weapon-slot').forEach(slot => {
      slot.classList.remove('active');
    });
    
    if (weaponType === 'primary') {
      document.getElementById('weaponPrimary').classList.add('active');
      this.showNotification('🔫 Rifle');
    } else if (weaponType === 'secondary') {
      document.getElementById('weaponSecondary').classList.add('active');
      this.showNotification('🔪 Pistol');
    } else if (weaponType === 'sniper') {
      document.getElementById('weaponSniper').classList.add('active');
      this.showNotification('🎯 Sniper');
    }
    
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
  
  updateHealthBar() {
    const healthFill = document.getElementById('healthFill');
    healthFill.style.width = `${this.health}%`;
    
    // Change color based on health
    if (this.health > 60) {
      healthFill.style.background = 'linear-gradient(90deg, #00ff00, #88ff00)';
    } else if (this.health > 30) {
      healthFill.style.background = 'linear-gradient(90deg, #ffaa00, #ffff00)';
    } else {
      healthFill.style.background = 'linear-gradient(90deg, #ff4444, #ff8844)';
    }
  }
  
  updateAmmo() {
    document.getElementById('ammoCount').textContent = `${this.ammo}/${this.maxAmmo}`;
  }
  
  showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 2000);
  }
}

// Initialize controller when page loads
window.addEventListener('DOMContentLoaded', () => {
  new GunFightController();
});
