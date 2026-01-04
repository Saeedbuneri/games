// 3D Racing Controller Logic - Tap Control
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
    
    // Tap control
    this.tapCount = 0;
    this.lastTapTime = 0;
    this.speed = 0;
    
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
      
      this.channel.subscribe('lapUpdate', (message) => {
        if (message.data.playerId === this.playerId) {
          this.currentLap = message.data.lap;
          document.getElementById('currentLapDisplay').textContent = this.currentLap;
        }
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
  }
  
  handleRaceStarted() {
    document.getElementById('waitingScreen').classList.remove('active');
    document.getElementById('racingScreen').classList.add('active');
    
    this.startCountdown();
  }
  
  setupControls() {
    const tapButton = document.getElementById('tapButton');
    
    tapButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleTap();
    });
    
    tapButton.addEventListener('click', (e) => {
      this.handleTap();
    });
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
    this.tapCount = 0;
    this.speed = 0;
    
    document.getElementById('raceCountdown').style.display = 'none';
    document.getElementById('tapSection').style.display = 'block';
    document.getElementById('tapButton').classList.remove('disabled');
    
    this.updateSpeedDisplay();
    this.setupControls();
  }
  
  handleTap() {
    if (!this.raceActive || this.finished) return;
    
    const now = Date.now();
    const timeSinceLastTap = now - this.lastTapTime;
    
    this.tapCount++;
    this.lastTapTime = now;
    
    // Speed boost from tapping, decay over time
    if (timeSinceLastTap < 200) {
      this.speed = Math.min(this.speed + 0.3, 3);
    } else {
      this.speed = Math.max(this.speed + 0.1, 0);
    }
    
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(20);
    }
    
    // Update UI
    document.getElementById('tapCount').textContent = `Taps: ${this.tapCount}`;
    this.updateSpeedDisplay();
    
    // Send speed to host
    this.channel.publish('racerControl', {
      playerId: this.playerId,
      speed: this.speed
    });
  }
  
  updateSpeedDisplay() {
    const speedKmh = Math.round(this.speed * 100);
    document.getElementById('speedDisplay').textContent = `${speedKmh} km/h`;
    document.getElementById('speedBar').style.width = `${Math.min(this.speed / 3 * 100, 100)}%`;
  }
  
  startRace() {
    this.raceActive = true;
    this.tapCount = 0;
    this.speed = 0;
    
    document.getElementById('raceCountdown').style.display = 'none';
    document.getElementById('tapSection').style.display = 'block';
    document.getElementById('tapButton').classList.remove('disabled');
    
    this.updateSpeedDisplay();
    
    // Speed decay interval
    this.controlInterval = setInterval(() => {
      if (this.raceActive && !this.finished) {
        // Natural speed decay
        this.speed = Math.max(0, this.speed * 0.96);
        this.updateSpeedDisplay();
      }
    }, 100);
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
