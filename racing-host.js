// Turbo Racer Host Screen Logic
class RacingHost {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.players = new Map();
    this.gameMode = 'multiplayer'; // multiplayer or ai
    this.game = null;
    
    this.init();
  }
  
  async init() {
    console.log('Racing host initializing...');
    try {
      await CONFIG.loadFromEnvironment();
      
      const roomCode = this.roomManager.createRoom();
      console.log('Room created:', roomCode);
      document.getElementById('roomCode').textContent = roomCode;
      
      // Generate QR code
      const baseUrl = window.location.origin + window.location.pathname.replace('racing-host.html', '');
      const joinUrl = baseUrl + 'controller-select.html?join=' + roomCode;
      const qrContainer = document.getElementById('qrCode');
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: joinUrl,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
      
      await this.connectToAbly();
      console.log('Racing host ready!');
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
        console.log('Host connected to room:', this.roomManager.roomCode);
      });
      
      this.channel.subscribe('playerJoinRequest', (message) => {
        this.handlePlayerJoinRequest(message.data);
      });
      
      this.channel.subscribe('playerLeave', (message) => {
        this.handlePlayerLeave(message.data);
      });
      
    } catch (error) {
      console.error('Connection error:', error);
    }
  }
  
  handlePlayerJoinRequest(data) {
    const playerId = data.playerId;
    
    if (this.players.has(playerId)) {
      console.log('Player already exists:', playerId);
      return;
    }
    
    if (this.players.size >= 8) {
      console.log('Room full, rejecting player');
      return;
    }
    
    const playerNumber = this.players.size + 1;
    const playerName = `Racer ${playerNumber}`;
    const carColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'];
    
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      number: playerNumber,
      color: carColors[playerNumber - 1],
      progress: 0,
      speed: 0,
      tapCount: 0,
      finished: false,
      finishTime: 0
    });
    
    this.channel.publish('playerJoinAccepted', {
      playerId: playerId,
      playerNumber: playerNumber,
      playerName: playerName,
      color: carColors[playerNumber - 1],
      roomCode: this.roomManager.roomCode
    });
    
    this.updatePlayerList();
    this.updateStartButton();
  }
  
  handlePlayerLeave(data) {
    this.players.delete(data.playerId);
    this.updatePlayerList();
    this.updateStartButton();
  }
  
  updatePlayerList() {
    const container = document.getElementById('playerList');
    
    if (this.players.size === 0) {
      container.innerHTML = '<div style="color: #888; font-size: 1em;">Waiting for racers to join...</div>';
      return;
    }
    
    container.innerHTML = '';
    this.players.forEach((player, index) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <div class="player-avatar">🏎️</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 1.1em;">${player.name}</div>
          <div style="font-size: 0.9em; opacity: 0.7;">Lane ${player.number}</div>
        </div>
        <div style="color: ${player.color}; font-weight: 900; font-size: 1.5em;">█</div>
      `;
      container.appendChild(item);
    });
  }
  
  updateStartButton() {
    const button = document.getElementById('startButton');
    const requirement = document.getElementById('playerRequirement');
    
    const minPlayers = this.gameMode === 'ai' ? 1 : 2;
    const canStart = this.players.size >= minPlayers;
    
    button.disabled = !canStart;
    
    if (canStart) {
      button.textContent = `🚀 START RACE (${this.players.size} Racers)`;
    } else {
      button.textContent = `⏳ Waiting for Racers (${this.players.size}/${minPlayers})`;
    }
    
    if (this.gameMode === 'ai') {
      requirement.textContent = 'Need at least 1 player (AI racers will fill remaining lanes)';
    } else {
      requirement.textContent = 'Need at least 2 players to start';
    }
  }
}

// Racing Game Logic
class RacingGame {
  constructor(host) {
    this.host = host;
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    this.raceDistance = 1500; // Distance to finish line
    this.racers = [];
    this.raceStartTime = 0;
    this.raceActive = false;
    this.countdown = 3;
    this.winner = null;
    
    this.initRacers();
    this.startCountdown();
    
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
  }
  
  initRacers() {
    const laneCount = 8;
    const laneHeight = this.canvas.height / laneCount;
    
    // Add human players
    let laneIndex = 0;
    this.host.players.forEach((player, playerId) => {
      this.racers.push({
        id: playerId,
        name: player.name,
        color: player.color,
        lane: laneIndex,
        laneY: laneIndex * laneHeight + laneHeight / 2,
        progress: 0,
        speed: 0,
        isAI: false,
        tapCount: 0,
        finished: false,
        finishTime: 0,
        finishPosition: 0
      });
      laneIndex++;
    });
    
    // Add AI racers if in AI mode
    if (this.host.gameMode === 'ai') {
      while (laneIndex < laneCount) {
        this.racers.push({
          id: 'ai-' + laneIndex,
          name: `AI Racer ${laneIndex + 1}`,
          color: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'][laneIndex],
          lane: laneIndex,
          laneY: laneIndex * laneHeight + laneHeight / 2,
          progress: 0,
          speed: 0,
          isAI: true,
          aiSpeed: 0.05 + Math.random() * 0.08, // Random AI difficulty
          tapCount: 0,
          finished: false,
          finishTime: 0,
          finishPosition: 0
        });
        laneIndex++;
      }
    }
  }
  
  startCountdown() {
    const countInterval = setInterval(() => {
      if (this.countdown === 0) {
        clearInterval(countInterval);
        this.startRace();
      } else {
        this.countdown--;
      }
    }, 1000);
    
    this.gameLoop();
  }
  
  startRace() {
    this.raceActive = true;
    this.raceStartTime = Date.now();
    
    this.host.channel.publish('raceStarted', {
      timestamp: Date.now()
    });
    
    // Subscribe to player taps
    this.host.channel.subscribe('racerTap', (message) => {
      this.handleRacerTap(message.data);
    });
  }
  
  handleRacerTap(data) {
    const racer = this.racers.find(r => r.id === data.playerId);
    if (racer && !racer.finished && this.raceActive) {
      racer.tapCount++;
      racer.speed = Math.min(racer.speed + 0.5, 3); // Increase speed with tap
    }
  }
  
  update() {
    if (!this.raceActive) return;
    
    let allFinished = true;
    let finishCount = this.racers.filter(r => r.finished).length;
    
    this.racers.forEach(racer => {
      if (racer.finished) return;
      
      allFinished = false;
      
      if (racer.isAI) {
        // AI logic - consistent speed with slight variation
        racer.speed = racer.aiSpeed + Math.sin(Date.now() / 1000) * 0.02;
        racer.tapCount += racer.aiSpeed * 5;
      } else {
        // Player - decay speed faster to require consistent tapping
        racer.speed = Math.max(racer.speed * 0.92, 0);
      }
      
      racer.progress += racer.speed;
      
      // Check if finished
      if (racer.progress >= this.raceDistance) {
        racer.finished = true;
        racer.finishTime = Date.now() - this.raceStartTime;
        racer.finishPosition = finishCount + 1;
        finishCount++;
        
        if (!this.winner) {
          this.winner = racer;
        }
        
        // Notify players
        this.host.channel.publish('racerFinished', {
          racerId: racer.id,
          position: racer.finishPosition,
          time: racer.finishTime,
          winner: racer.finishPosition === 1
        });
      }
    });
    
    if (allFinished) {
      this.endRace();
    }
  }
  
  endRace() {
    this.raceActive = false;
    
    setTimeout(() => {
      this.showResults();
    }, 2000);
  }
  
  showResults() {
    // Sort by finish position
    const results = [...this.racers].sort((a, b) => a.finishPosition - b.finishPosition);
    
    this.host.channel.publish('raceEnded', {
      results: results.map(r => ({
        name: r.name,
        position: r.finishPosition,
        time: r.finishTime,
        taps: r.tapCount
      }))
    });
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw lanes
    this.drawLanes();
    
    // Draw racers
    this.drawRacers();
    
    // Draw countdown or race info
    if (this.countdown > 0) {
      this.drawCountdown();
    } else {
      this.drawRaceInfo();
    }
  }
  
  drawLanes() {
    const laneCount = 8;
    const laneHeight = this.canvas.height / laneCount;
    
    for (let i = 0; i < laneCount; i++) {
      // Lane background
      this.ctx.fillStyle = i % 2 === 0 ? '#222' : '#2a2a2a';
      this.ctx.fillRect(0, i * laneHeight, this.canvas.width, laneHeight);
      
      // Lane divider
      this.ctx.strokeStyle = '#444';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(0, i * laneHeight);
      this.ctx.lineTo(this.canvas.width, i * laneHeight);
      this.ctx.stroke();
      
      // Lane number
      this.ctx.fillStyle = '#666';
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillText(`${i + 1}`, 20, i * laneHeight + laneHeight / 2 + 8);
    }
    
    // Finish line
    const finishX = (this.canvas.width - 100);
    this.ctx.fillStyle = '#fff';
    for (let i = 0; i < this.canvas.height; i += 40) {
      this.ctx.fillRect(finishX, i, 20, 20);
      this.ctx.fillStyle = this.ctx.fillStyle === '#fff' ? '#000' : '#fff';
    }
  }
  
  drawRacers() {
    const startX = 80;
    const raceWidth = this.canvas.width - 200;
    
    this.racers.forEach(racer => {
      const x = startX + (racer.progress / this.raceDistance) * raceWidth;
      const y = racer.laneY;
      
      // Car body
      this.ctx.fillStyle = racer.color;
      this.ctx.fillRect(x - 30, y - 15, 60, 30);
      
      // Car shine
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.fillRect(x - 25, y - 10, 50, 8);
      
      // Wheels
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(x - 25, y - 20, 15, 10);
      this.ctx.fillRect(x + 10, y - 20, 15, 10);
      this.ctx.fillRect(x - 25, y + 10, 15, 10);
      this.ctx.fillRect(x + 10, y + 10, 15, 10);
      
      // Speed lines
      if (racer.speed > 0.5) {
        this.ctx.strokeStyle = racer.color;
        this.ctx.lineWidth = 2;
        this.ctx.globalAlpha = 0.5;
        for (let i = 0; i < 3; i++) {
          this.ctx.beginPath();
          this.ctx.moveTo(x - 40 - i * 10, y - 8 + i * 8);
          this.ctx.lineTo(x - 60 - i * 10, y - 8 + i * 8);
          this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1;
      }
      
      // Name tag
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 14px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(racer.name, x, y - 30);
      
      // Finish position
      if (racer.finished) {
        this.ctx.fillStyle = racer.finishPosition === 1 ? '#ffd700' : '#fff';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillText(`#${racer.finishPosition}`, x, y + 50);
      }
    });
    
    this.ctx.textAlign = 'left';
  }
  
  drawCountdown() {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.fillStyle = this.countdown === 0 ? '#00ff00' : '#fff';
    this.ctx.font = 'bold 150px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(this.countdown === 0 ? 'GO!' : this.countdown, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.textAlign = 'left';
  }
  
  drawRaceInfo() {
    if (this.winner) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      this.ctx.fillRect(this.canvas.width / 2 - 250, 50, 500, 120);
      
      this.ctx.fillStyle = '#ffd700';
      this.ctx.font = 'bold 40px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('🏆 WINNER! 🏆', this.canvas.width / 2, 110);
      
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 30px Arial';
      this.ctx.fillText(this.winner.name, this.canvas.width / 2, 150);
      
      this.ctx.textAlign = 'left';
    }
  }
  
  gameLoop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Global
let racingHost;

window.addEventListener('load', () => {
  racingHost = new RacingHost();
});

function selectRacingMode(mode) {
  if (!racingHost) return;
  
  racingHost.gameMode = mode;
  
  document.getElementById('modeMultiplayer').classList.toggle('selected', mode === 'multiplayer');
  document.getElementById('modeAI').classList.toggle('selected', mode === 'ai');
  
  racingHost.updateStartButton();
}

function startRace() {
  if (!racingHost) return;
  
  const minPlayers = racingHost.gameMode === 'ai' ? 1 : 2;
  if (racingHost.players.size < minPlayers) {
    alert(`Need at least ${minPlayers} player(s) to start!`);
    return;
  }
  
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.add('active');
  
  racingHost.game = new RacingGame(racingHost);
}

function quitRaceToMenu() {
  if (confirm('Are you sure you want to quit the race?')) {
    if (racingHost && racingHost.channel) {
      racingHost.channel.publish('raceEnded', { quit: true });
    }
    
    document.getElementById('setupScreen').classList.remove('hidden');
    document.getElementById('gameScreen').classList.remove('active');
    
    if (racingHost) {
      racingHost.game = null;
      racingHost.updatePlayerList();
      racingHost.updateStartButton();
    }
  }
}
