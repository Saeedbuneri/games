// 3D Racing Controller Logic
class Racing3DController {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = null;
    this.playerData = null;
    this.raceActive = false;
    this.finished = false;
    this.currentLap = 1;
    
    // Motion sensors
    this.steering = 0; // -1 to 1
    this.speed = 0; // 0 to 2
    this.tiltAngle = 0;
    this.pitch = 0;
    
    this.init();
  }
  
  async init() {
    console.log('3D Racing controller initializing...');
    try {
      await CONFIG.loadFromEnvironment();
      
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room');
      
      if (roomCode) {
        this.roomManager.roomCode = roomCode;
        this.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
        await this.connectToAbly();
        console.log('3D Racing controller ready!');
      } else {
        document.getElementById('connectionScreen').classList.remove('active');
        document.getElementById('codeEntryScreen').classList.add('active');
        this.setupCodeEntry();
      }
    } catch (error) {
      console.error('Init error:', error);
      alert('Failed to initialize: ' + error.message);
    }
  }
  
  setupCodeEntry() {
    const input = document.getElementById('roomCodeInput');
    
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && input.value.length === 6) {
        window.join3DRoom();
      }
    });
    
    setTimeout(() => input.focus(), 100);
  }
  
  async joinWithCode(code) {
    document.getElementById('codeEntryScreen').classList.remove('active');
    document.getElementById('connectionScreen').classList.add('active');
    
    this.roomManager.roomCode = code;
    this.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    
    await this.connectToAbly();
    console.log('3D Racing controller ready!');
  }
  
  async connectToAbly() {
    try {
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = `racing3d-room-${this.roomManager.roomCode}`;
      this.channel = this.ably.channels.get(channelName);
      
      this.ably.connection.on('connected', () => {
        console.log('Controller connected to room:', this.roomManager.roomCode);
        this.requestJoin();
      });
      
      this.channel.subscribe('playerJoinAccepted', (message) => {
        if (message.data.playerId === this.playerId) {
          this.handleJoinAccepted(message.data);
        }
      });
      
      this.channel.subscribe('raceStarted', (message) => {
        this.handleRaceStarted();
      });
      
      this.channel.subscribe('racerFinished', (message) => {
        this.handleRacerFinished(message.data);
      });
      
      this.channel.subscribe('raceEnded', (message) => {
        this.handleRaceEnded(message.data);
      });
      
    } catch (error) {
      console.error('Connection error:', error);
    }
  }
  
  requestJoin() {
    this.channel.publish('playerJoinRequest', {
      playerId: this.playerId,
      timestamp: Date.now()
    });
  }
  
  handleJoinAccepted(data) {
    this.playerData = data;
    
    document.getElementById('playerName').textContent = data.playerName;
    document.getElementById('playerLane').textContent = `Lane ${data.playerNumber}`;
    
    document.getElementById('connectionScreen').classList.remove('active');
    document.getElementById('waitingScreen').classList.add('active');
    
    // Request motion permissions
    this.requestMotionPermission();
  }
  
  async requestMotionPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          this.startMotionTracking();
        } else {
          alert('Motion sensor permission denied. Please allow motion sensors in settings.');
        }
      } catch (error) {
        console.error('Permission error:', error);
      }
    } else {
      // Android/older browsers - no permission needed
      this.startMotionTracking();
    }
  }
  
  startMotionTracking() {
    window.addEventListener('deviceorientation', (event) => {
      // Gamma: left/right tilt (-90 to 90)
      // Beta: front/back tilt (-180 to 180)
      
      const gamma = event.gamma || 0;
      const beta = event.beta || 0;
      
      this.tiltAngle = gamma;
      this.pitch = beta;
      
      // Steering: normalize gamma to -1 to 1
      this.steering = Math.max(-1, Math.min(1, gamma / 45));
      
      // Speed: phone upright = fast, tilted forward = slower
      // Beta around 0-30 = upright/racing position
      const normalizedBeta = Math.abs(beta - 45); // 45 is typical holding angle
      this.speed = Math.max(0, Math.min(2, (90 - normalizedBeta) / 45));
      
      if (this.raceActive) {
        this.updateUI();
      }
    });
    
    console.log('Motion tracking started');
  }
  
  handleRaceStarted() {
    document.getElementById('waitingScreen').classList.remove('active');
    document.getElementById('racingScreen').classList.add('active');
    
    this.startCountdown();
  }
  
  startCountdown() {
    let countdown = 3;
    const countdownEl = document.getElementById('raceCountdown');
    
    const countInterval = setInterval(() => {
      if (countdown === 0) {
        clearInterval(countInterval);
        countdownEl.textContent = 'GO!';
        countdownEl.style.color = '#00ff00';
        
        setTimeout(() => {
          this.startRace();
        }, 500);
      } else {
        countdownEl.textContent = countdown;
        countdown--;
      }
    }, 1000);
  }
  
  startRace() {
    this.raceActive = true;
    
    document.getElementById('raceCountdown').style.display = 'none';
    document.getElementById('racingControls').style.display = 'block';
    
    // Start sending controls to host
    this.controlInterval = setInterval(() => {
      if (this.raceActive && !this.finished) {
        this.sendControls();
      }
    }, 50); // 20 updates per second
  }
  
  sendControls() {
    this.channel.publish('racerControl', {
      playerId: this.playerId,
      steering: this.steering,
      speed: this.speed,
      timestamp: Date.now()
    });
  }
  
  updateUI() {
    // Update steering wheel rotation
    const steeringWheel = document.getElementById('steeringWheel');
    steeringWheel.style.transform = `rotate(${this.steering * 90}deg)`;
    
    // Update tilt indicator
    document.getElementById('tiltIndicator').textContent = `Tilt: ${Math.round(this.tiltAngle)}°`;
    
    // Update speedometer
    const speedPercent = (this.speed / 2) * 100;
    document.getElementById('speedDisplay').textContent = Math.round(speedPercent);
    document.getElementById('speedBar').style.width = `${speedPercent}%`;
  }
  
  handleRacerFinished(data) {
    if (data.racerId === this.playerId) {
      this.finished = true;
      clearInterval(this.controlInterval);
      
      // Vibrate
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }
  }
  
  handleRaceEnded(data) {
    this.raceActive = false;
    clearInterval(this.controlInterval);
    
    setTimeout(() => {
      document.getElementById('racingScreen').classList.remove('active');
      document.getElementById('resultsScreen').classList.add('active');
      
      document.getElementById('finishResult').innerHTML = `
        <div style="font-size: 2em; font-weight: 900; margin-bottom: 20px;">
          Race Complete!
        </div>
        <div style="font-size: 1.3em;">
          Check the main screen for final results
        </div>
      `;
    }, 1000);
  }
}

// Global
let racing3DController;

window.addEventListener('load', () => {
  racing3DController = new Racing3DController();
});

// Prevent screen sleep
let wakeLock = null;
if ('wakeLock' in navigator) {
  navigator.wakeLock.request('screen').then(lock => {
    wakeLock = lock;
    console.log('Screen wake lock active');
  }).catch(err => {
    console.log('Wake lock error:', err);
  });
}

// Prevent accidental back navigation
window.addEventListener('beforeunload', (e) => {
  if (racing3DController && racing3DController.raceActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});
