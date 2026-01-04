// Turbo Racer Controller Logic
class RacingController {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = null;
    this.playerData = null;
    this.tapCount = 0;
    this.lastTapTime = 0;
    this.speed = 0;
    this.raceActive = false;
    this.finished = false;
    
    this.init();
  }
  
  async init() {
    console.log('Racing controller initializing...');
    try {
      await CONFIG.loadFromEnvironment();
      
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room');
      
      if (!roomCode) {
        alert('No room code provided!');
        return;
      }
      
      this.roomManager.roomCode = roomCode;
      this.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
      
      await this.connectToAbly();
      this.setupControls();
      
      console.log('Racing controller ready!');
    } catch (error) {
      console.error('Init error:', error);
      alert('Failed to initialize: ' + error.message);
    }
  }
  
  async connectToAbly() {
    try {
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = `racing-room-${this.roomManager.roomCode}`;
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
    this.tapCount = 0;
    this.speed = 0;
    
    document.getElementById('raceCountdown').style.display = 'none';
    document.getElementById('tapSection').style.display = 'block';
    document.getElementById('tapButton').classList.remove('disabled');
    
    this.updateSpeedDisplay();
  }
  
  setupControls() {
    const tapButton = document.getElementById('tapButton');
    
    // Handle both click and touch for better responsiveness
    tapButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleTap();
    });
    
    tapButton.addEventListener('click', (e) => {
      this.handleTap();
    });
  }
  
  handleTap() {
    if (!this.raceActive || this.finished) return;
    
    const now = Date.now();
    const timeSinceLastTap = now - this.lastTapTime;
    
    this.tapCount++;
    this.lastTapTime = now;
    
    // Calculate speed based on tap frequency
    if (timeSinceLastTap < 200) {
      this.speed = Math.min(this.speed + 10, 100);
    } else {
      this.speed = Math.max(this.speed - 5, 0);
    }
    
    // Send tap to host
    this.channel.publish('racerTap', {
      playerId: this.playerId,
      tapCount: this.tapCount,
      speed: this.speed,
      timestamp: now
    });
    
    // Vibrate for feedback
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
    
    // Visual feedback
    const button = document.getElementById('tapButton');
    button.classList.add('vibrate-animation');
    setTimeout(() => {
      button.classList.remove('vibrate-animation');
    }, 100);
    
    this.updateSpeedDisplay();
  }
  
  updateSpeedDisplay() {
    document.getElementById('tapCount').textContent = `${this.tapCount} TAPS`;
    document.getElementById('speedBar').style.width = `${this.speed}%`;
    document.getElementById('speedText').textContent = `${Math.round(this.speed)}%`;
    
    // Decay speed gradually
    if (this.raceActive && !this.finished) {
      setTimeout(() => {
        this.speed = Math.max(this.speed - 2, 0);
        this.updateSpeedDisplay();
      }, 200);
    }
  }
  
  handleRacerFinished(data) {
    if (data.racerId === this.playerId) {
      this.finished = true;
      this.raceActive = false;
      
      document.getElementById('tapButton').classList.add('disabled');
      
      const position = data.position;
      const time = (data.time / 1000).toFixed(2);
      
      let positionText = '';
      let positionClass = '';
      
      if (position === 1) {
        positionText = '🏆 1ST PLACE! 🏆';
        positionClass = 'gold';
      } else if (position === 2) {
        positionText = '🥈 2ND PLACE!';
        positionClass = 'silver';
      } else if (position === 3) {
        positionText = '🥉 3RD PLACE!';
        positionClass = 'bronze';
      } else {
        positionText = `${this.getOrdinal(position)} PLACE`;
      }
      
      const finishStatus = document.createElement('div');
      finishStatus.className = `finish-status ${positionClass}`;
      finishStatus.textContent = positionText;
      
      const tapSection = document.getElementById('tapSection');
      tapSection.insertBefore(finishStatus, tapSection.firstChild);
      
      // Vibrate for finish
      if (navigator.vibrate) {
        if (position === 1) {
          navigator.vibrate([100, 50, 100, 50, 100]);
        } else {
          navigator.vibrate(200);
        }
      }
    }
  }
  
  handleRaceEnded(data) {
    setTimeout(() => {
      this.showResults(data.results);
    }, 2000);
  }
  
  showResults(results) {
    document.getElementById('racingScreen').classList.remove('active');
    document.getElementById('resultsScreen').classList.add('active');
    
    // Find your result
    const yourResult = results.find(r => r.name === this.playerData.playerName);
    const yourResultEl = document.getElementById('yourResult');
    
    if (yourResult) {
      const position = yourResult.position;
      let positionClass = '';
      
      if (position === 1) {
        positionClass = 'gold';
        yourResultEl.textContent = '🏆 YOU WON! 🏆';
      } else if (position === 2) {
        positionClass = 'silver';
        yourResultEl.textContent = '🥈 2ND PLACE!';
      } else if (position === 3) {
        positionClass = 'bronze';
        yourResultEl.textContent = '🥉 3RD PLACE!';
      } else {
        yourResultEl.textContent = `${this.getOrdinal(position)} Place`;
      }
      
      yourResultEl.className = `finish-status ${positionClass}`;
    }
    
    // Show all results
    const resultsList = document.getElementById('resultsList');
    resultsList.innerHTML = '';
    
    results.forEach(result => {
      const item = document.createElement('div');
      item.className = 'result-item';
      
      let positionClass = '';
      if (result.position === 1) positionClass = 'gold';
      else if (result.position === 2) positionClass = 'silver';
      else if (result.position === 3) positionClass = 'bronze';
      
      const time = (result.time / 1000).toFixed(2);
      
      item.innerHTML = `
        <div class="result-position ${positionClass}">${this.getOrdinal(result.position)}</div>
        <div class="result-name">${result.name}</div>
        <div class="result-time">${time}s (${result.taps} taps)</div>
      `;
      
      resultsList.appendChild(item);
    });
  }
  
  getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
}

// Global
let racingController;

window.addEventListener('load', () => {
  racingController = new RacingController();
});

// Handle visibility change
document.addEventListener('visibilitychange', () => {
  if (document.hidden && racingController && racingController.channel) {
    console.log('Page hidden, maintaining connection...');
  }
});

// Prevent accidental back navigation
window.addEventListener('beforeunload', (e) => {
  if (racingController && racingController.raceActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});
