// Controller Logic
class Controller {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    this.isCalibrated = false;
    this.permissionsGranted = false;
    
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
  }
  
  init() {
    // Check for room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
      document.getElementById('roomCodeInput').value = joinCode;
    }
    
    // Auto-uppercase room code input
    document.getElementById('roomCodeInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
  
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }
  
  async connectToRoom(roomCode) {
    try {
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = `badminton-room-${roomCode}`;
      this.channel = this.ably.channels.get(channelName);
      
      this.ably.connection.on('connected', () => {
        console.log('Connected to room:', roomCode);
        
        // Request to join game
        this.channel.publish('playerJoinRequest', {
          playerId: this.playerId,
          playerName: 'Player ' + Math.floor(Math.random() * 1000)
        });
      });
      
      // Listen for join acceptance
      this.channel.subscribe('playerJoinAccepted', (message) => {
        if (message.data.playerId === this.playerId) {
          console.log('Joined game as player', message.data.playerNumber);
          this.onJoinAccepted();
        }
      });
      
      // Listen for game start
      this.channel.subscribe('gameStarted', () => {
        this.onGameStarted();
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
    // Move to permission screen
    this.showScreen('permissionScreen');
  }
  
  async requestSensorPermissions() {
    try {
      // iOS 13+ requires permission
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const response = await DeviceMotionEvent.requestPermission();
        if (response !== 'granted') {
          throw new Error('Motion permission denied');
        }
      }
      
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response !== 'granted') {
          throw new Error('Orientation permission denied');
        }
      }
      
      this.permissionsGranted = true;
      this.startSensorListening();
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
    const now = Date.now();
    if (now - this.lastSwingTime < this.swingCooldown) return;
    
    const speed = Utils.magnitude(
      this.smoothed.accel.x,
      this.smoothed.accel.y,
      this.smoothed.accel.z
    );
    
    if (speed > 3) {
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
  
  if (controller.roomManager.joinRoom(code)) {
    const connected = await controller.connectToRoom(code);
    
    if (connected) {
      // Wait for join acceptance
      console.log('Waiting for host to accept...');
    } else {
      alert('❌ Failed to connect to room. Please check the code and try again.');
    }
  } else {
    alert('⚠️ Invalid room code format');
  }
}

function scanQRCode() {
  alert('📷 QR Scanner\n\nNote: This requires camera access. For now, please enter the room code manually.\n\n(Full QR scanning will be added in a future update)');
}

async function requestPermissions() {
  const granted = await controller.requestSensorPermissions();
  
  if (granted) {
    controller.showScreen('calibrationScreen');
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
