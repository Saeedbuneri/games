// Controller Logic
class Controller {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = 'player-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.playerNumber = null;
    this.isCalibrated = false;
    this.permissionsGranted = false;
    this.pendingRoomCode = null; // Store room code until permissions granted
    this.isConnected = false;
    this.gameStarted = false;
    
    // Sensor data
    this.sensors = {
      acceleration: { x: 0, y: 0, z: 0 },
      gyroscope: { alpha: 0, beta: 0, gamma: 0 }
    };
    
    this.smoothed = {
      accel: { x: 0, y: 0, z: 0 },
      gyro: { alpha: 0, beta: 0, gamma: 0 }
    };
    
    this.baseline = {
      accel: { x: 0, y: 0, z: 0 },
      gyro: { alpha: 0, beta: 0, gamma: 0 }
    };
    
    this.lastSwingTime = 0;
    this.swingCooldown = 300;
    
    this.init();
    this.setupDisconnectHandler();
  }
  
  init() {
    // Check for room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
      const input = document.getElementById('roomCodeInput');
      input.value = joinCode.toUpperCase();
      
      // Show a notification that they can join
      setTimeout(() => {
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(74, 222, 128, 0.95);
          color: white;
          padding: 15px 25px;
          border-radius: 15px;
          font-weight: 600;
          z-index: 1000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          animation: slideDown 0.3s ease-out;
        `;
        notification.textContent = `📱 Ready to join room ${joinCode}!`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
          notification.style.animation = 'slideUp 0.3s ease-out';
          setTimeout(() => notification.remove(), 300);
        }, 3000);
      }, 500);
    }
    
    // Auto-uppercase room code input
    document.getElementById('roomCodeInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
  
  setupDisconnectHandler() {
    // Handle page close/refresh
    window.addEventListener('beforeunload', () => {
      this.leaveGame();
    });
    
    // Handle page visibility changes (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isConnected) {
        console.log('Page hidden - maintaining connection');
      }
    });
    
    // Handle connection loss
    if (this.ably) {
      this.ably.connection.on('disconnected', () => {
        console.log('Disconnected from Ably');
        this.updateConnectionStatus('Disconnected', false);
      });
    }
  }
  
  leaveGame() {
    if (this.channel && this.isConnected) {
      console.log('Leaving game...');
      this.channel.publish('playerLeave', {
        playerId: this.playerId,
        playerNumber: this.playerNumber
      });
      this.isConnected = false;
    }
  }
  
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }
  
  async connectToRoom(roomCode) {
    try {
      console.log('Connecting to room:', roomCode);
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = `badminton-room-${roomCode}`;
      this.channel = this.ably.channels.get(channelName);
      
      this.ably.connection.on('connected', () => {
        console.log('Connected to room:', roomCode);
        
        // Wait a bit for polling to establish, then request to join
        setTimeout(() => {
          console.log('Sending join request for player:', this.playerId);
          this.channel.publish('playerJoinRequest', {
            playerId: this.playerId
          });
        }, 1000);
      });
      
      // Listen for join acceptance
      this.channel.subscribe('playerJoinAccepted', (message) => {
        console.log('Received playerJoinAccepted:', message);
        if (message.data.playerId === this.playerId) {
          this.playerNumber = message.data.playerNumber;
          console.log('Join accepted! You are Player', this.playerNumber);
          
          // Small delay to ensure host has updated their UI
          setTimeout(() => {
            this.onJoinAccepted();
          }, 500);
        }
      });
      
      // Listen for game start
      this.channel.subscribe('gameStarted', () => {
        console.log('Game started!');
        this.onGameStarted();
      });
      
      // Listen for game end
      this.channel.subscribe('gameEnded', (message) => {
        console.log('Game ended!', message.data);
        this.gameStarted = false;
        this.isCalibrated = false;
        
        // Show final score notification
        if (message.data.finalScore) {
          alert(`🏸 Game Over!\n\nPlayer 1: ${message.data.finalScore.player1}\nPlayer 2: ${message.data.finalScore.player2}`);
        }
        
        // Return to code entry screen
        this.showScreen('codeEntryScreen');
      });
      
      // Listen for haptic feedback
      this.channel.subscribe('haptic', (message) => {
        if (message.data.playerId === this.playerId) {
          this.triggerHaptic(message.data.pattern);
        }
      });
      
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }
  
  onJoinAccepted() {
    console.log('Join accepted! Updating UI...');
    this.isConnected = true;
    
    // Update player number display
    if (this.playerNumber) {
      const displays = ['playerNumberDisplay', 'gamePlayerNumber'];
      displays.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.textContent = this.playerNumber;
      });
      console.log('Updated player number displays to:', this.playerNumber);
    }
    
    // Update calibration screen to show we're in lobby
    const progressElem = document.getElementById('calibrationProgress');
    if (progressElem) {
      progressElem.textContent = `✓ You're in the lobby as Player ${this.playerNumber}!\nHold phone flat and press calibrate when ready.`;
      
      // Enable calibration button
      const calibrateBtn = document.getElementById('calibrateBtn');
      if (calibrateBtn) {
        calibrateBtn.disabled = false;
        calibrateBtn.textContent = '⚖️ Start Calibration';
      }
    }
  }
  
  async requestSensorPermissions() {
    console.log('Requesting sensor permissions...');
    
    try {
      // Check if permissions API exists (iOS 13+)
      const needsPermission = (typeof DeviceMotionEvent !== 'undefined' && 
                               typeof DeviceMotionEvent.requestPermission === 'function');
      
      if (needsPermission) {
        console.log('iOS device detected, requesting permission...');
        
        const motionResponse = await DeviceMotionEvent.requestPermission();
        console.log('Motion permission response:', motionResponse);
        
        if (motionResponse !== 'granted') {
          throw new Error('Motion permission denied');
        }
        
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const orientationResponse = await DeviceOrientationEvent.requestPermission();
          console.log('Orientation permission response:', orientationResponse);
          
          if (orientationResponse !== 'granted') {
            throw new Error('Orientation permission denied');
          }
        }
      } else {
        console.log('Non-iOS device, no explicit permission needed');
      }
      
      this.permissionsGranted = true;
      this.startSensorListening();
      console.log('Sensor permissions granted!');
      return true;
      
    } catch (error) {
      console.error('Permission error:', error);
      alert('⚠️ Sensor permissions denied. Please allow motion sensors in your browser settings.');
      return false;
    }
  }
  
  startSensorListening() {
    window.addEventListener('devicemotion', (event) => {
      if (event.accelerationIncludingGravity) {
        this.sensors.acceleration = {
          x: event.accelerationIncludingGravity.x || 0,
          y: event.accelerationIncludingGravity.y || 0,
          z: event.accelerationIncludingGravity.z || 0
        };
      }
    });
    
    window.addEventListener('deviceorientation', (event) => {
      this.sensors.gyroscope = {
        alpha: event.alpha || 0,
        beta: event.beta || 0,
        gamma: event.gamma || 0
      };
    });
  }
  
  async performCalibration() {
    return new Promise((resolve) => {
      const samples = [];
      const totalSamples = 60;
      let count = 0;
      
      const interval = setInterval(() => {
        if (this.sensors.acceleration.x !== 0) {
          samples.push({
            accel: { ...this.sensors.acceleration },
            gyro: { ...this.sensors.gyroscope }
          });
          count++;
          
          const progress = Math.round((count / totalSamples) * 100);
          document.getElementById('calibrationProgress').textContent = 
            `Calibrating... ${progress}%\nKeep phone still!`;
        }
        
        if (count >= totalSamples) {
          clearInterval(interval);
          
          // Calculate baseline
          let avgAccel = { x: 0, y: 0, z: 0 };
          let avgGyro = { alpha: 0, beta: 0, gamma: 0 };
          
          samples.forEach(sample => {
            avgAccel.x += sample.accel.x;
            avgAccel.y += sample.accel.y;
            avgAccel.z += sample.accel.z;
            avgGyro.alpha += sample.gyro.alpha || 0;
            avgGyro.beta += sample.gyro.beta || 0;
            avgGyro.gamma += sample.gyro.gamma || 0;
          });
          
          this.baseline.accel.x = avgAccel.x / samples.length;
          this.baseline.accel.y = avgAccel.y / samples.length;
          this.baseline.accel.z = avgAccel.z / samples.length;
          this.baseline.gyro.alpha = avgGyro.alpha / samples.length;
          this.baseline.gyro.beta = avgGyro.beta / samples.length;
          this.baseline.gyro.gamma = avgGyro.gamma / samples.length;
          
          this.isCalibrated = true;
          resolve();
        }
      }, 50);
    });
  }
  
  onGameStarted() {
    this.gameStarted = true;
    if (this.isCalibrated) {
      this.showScreen('gameScreen');
      this.startGameplay();
    }
  }
  
  startGameplay() {
    // Update connection status
    document.getElementById('connectionStatus').className = 'status-badge connected';
    document.getElementById('connectionStatus').textContent = '🟢 Connected';
    
    // Start sensor broadcast
    setInterval(() => {
      this.processSensorData();
      this.detectSwing();
      this.updateUI();
    }, 50);
  }
  
  processSensorData() {
    const alpha = 0.7;
    
    this.smoothed.accel.x = Utils.lowPassFilter(
      this.sensors.acceleration.x - this.baseline.accel.x,
      this.smoothed.accel.x,
      alpha
    );
    this.smoothed.accel.y = Utils.lowPassFilter(
      this.sensors.acceleration.y - this.baseline.accel.y,
      this.smoothed.accel.y,
      alpha
    );
    this.smoothed.accel.z = Utils.lowPassFilter(
      this.sensors.acceleration.z - this.baseline.accel.z,
      this.smoothed.accel.z,
      alpha
    );
    
    this.smoothed.gyro.gamma = Utils.lowPassFilter(
      this.sensors.gyroscope.gamma - this.baseline.gyro.gamma,
      this.smoothed.gyro.gamma,
      alpha
    );
    this.smoothed.gyro.beta = Utils.lowPassFilter(
      this.sensors.gyroscope.beta - this.baseline.gyro.beta,
      this.smoothed.gyro.beta,
      alpha
    );
  }
  
  detectSwing() {
    // Only detect swings when game is active and calibrated
    if (!this.isCalibrated) return;
    if (!this.gameStarted) return;
    if (!this.channel) return;
    
    const now = Date.now();
    if (now - this.lastSwingTime < this.swingCooldown) return;
    
    const speed = Utils.magnitude(
      this.smoothed.accel.x,
      this.smoothed.accel.y,
      this.smoothed.accel.z
    );
    
    // Increased threshold to prevent accidental swings
    if (speed > 8) {
      this.lastSwingTime = now;
      this.sendSwing(speed);
    }
  }
  
  sendSwing(speed) {
    let swingType = 'normal';
    if (speed > 15) swingType = 'smash';
    else if (speed < 5) swingType = 'drop';
    
    const angle = this.calculateSwingAngle();
    
    this.channel.publish('swing', {
      playerId: this.playerId,
      speed: speed,
      type: swingType,
      angle: angle,
      rotation: this.smoothed.gyro.gamma,
      timestamp: Date.now()
    });
    
    this.showSwingFeedback(speed, swingType);
  }
  
  calculateSwingAngle() {
    const beta = this.smoothed.gyro.beta;
    const gamma = this.smoothed.gyro.gamma;
    
    if (Math.abs(beta) > 45) {
      return beta > 0 ? 'overhead' : 'underhand';
    } else if (Math.abs(gamma) > 30) {
      return gamma > 0 ? 'forehand' : 'backhand';
    }
    return 'neutral';
  }
  
  showSwingFeedback(speed, type) {
    const indicator = document.getElementById('swingIndicator');
    indicator.classList.add('hit');
    setTimeout(() => indicator.classList.remove('hit'), 300);
  }
  
  updateUI() {
    const speed = Utils.magnitude(
      this.smoothed.accel.x,
      this.smoothed.accel.y,
      this.smoothed.accel.z
    );
    
    const angle = Math.round(this.smoothed.gyro.gamma);
    
    let type = 'READY';
    if (speed > 15) type = 'SMASH!';
    else if (speed > 5) type = 'HIT';
    else if (speed > 3) type = 'DROP';
    
    document.getElementById('powerValue').textContent = Math.round(speed);
    document.querySelector('.power-label').textContent = type;
    document.getElementById('sensorInfo').innerHTML = `
      Speed: ${speed.toFixed(1)} m/s<br>
      Angle: ${angle}°<br>
      Status: ${type}
    `;
  }
  
  triggerHaptic(pattern) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
  
  updateConnectionStatus(message, connected) {
    const status = document.getElementById('connectionStatus');
    if (status) {
      status.textContent = connected ? '🟢 Connected' : '🔴 ' + message;
      status.className = connected ? 'status-badge connected' : 'status-badge';
    }
  }
}

// Global functions
let controller;

window.addEventListener('load', () => {
  controller = new Controller();
});

async function joinRoom() {
  const code = document.getElementById('roomCodeInput').value.trim();
  
  if (!code || code.length !== 6) {
    alert('⚠️ Please enter a valid 6-character room code');
    return;
  }
  
  if (!controller.roomManager.joinRoom(code)) {
    alert('⚠️ Invalid room code format');
    return;
  }
  
  // Store the room code
  controller.pendingRoomCode = code;
  
  // Request permissions immediately
  console.log('Requesting sensor permissions...');
  const granted = await controller.requestSensorPermissions();
  
  if (granted) {
    // Permissions granted, now connect to room
    console.log('Permissions granted, connecting to room:', code);
    
    const connected = await controller.connectToRoom(code);
    
    if (connected) {
      // Show waiting screen
      controller.showScreen('calibrationScreen');
      document.getElementById('calibrationProgress').textContent = 
        'Connected! Waiting for host to accept...';
    } else {
      alert('❌ Failed to connect to room. Please check the code and try again.');
      controller.showScreen('codeEntryScreen');
    }
  } else {
    // Permission denied - show error and stay on code entry screen
    alert('⚠️ Motion sensor permission is required to play. Please allow access and try again.');
    controller.showScreen('codeEntryScreen');
  }
}

function scanQRCode() {
  alert('📷 QR Scanner\n\nNote: This requires camera access. For now, please enter the room code manually.\n\n(Full QR scanning will be added in a future update)');
}

async function requestPermissions() {
  const granted = await controller.requestSensorPermissions();
  
  if (granted) {
    // Permissions granted, now connect to room
    if (controller.pendingRoomCode) {
      console.log('Permissions granted, connecting to room:', controller.pendingRoomCode);
      
      const connected = await controller.connectToRoom(controller.pendingRoomCode);
      
      if (connected) {
        // Show waiting screen
        controller.showScreen('calibrationScreen');
        document.getElementById('calibrationProgress').textContent = 
          'Connected! Waiting for host to accept...';
      } else {
        alert('❌ Failed to connect to room. Please check the code and try again.');
        controller.showScreen('codeEntryScreen');
      }
    } else {
      // No pending room code, go to calibration
      controller.showScreen('calibrationScreen');
    }
  }
}

async function startCalibration() {
  document.getElementById('calibrateBtn').disabled = true;
  document.getElementById('calibrateBtn').textContent = 'Calibrating...';
  
  await controller.performCalibration();
  
  document.getElementById('calibrationProgress').textContent = 
    '✓ Calibration complete!\nWaiting for host to start game...';
  
  document.getElementById('calibrateBtn').textContent = '✓ Calibrated';
}

function leaveGameBtn() {
  if (confirm('Are you sure you want to leave the game?')) {
    controller.leaveGame();
    // Reload page to reset state
    window.location.href = window.location.pathname;
  }
}
