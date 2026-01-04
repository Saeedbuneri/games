// 3D Racing Host Logic
class Racing3DHost {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.players = new Map();
    this.gameMode = 'multiplayer';
    this.game = null;
    
    this.init();
  }
  
  async init() {
    console.log('3D Racing host initializing...');
    try {
      await CONFIG.loadFromEnvironment();
      
      const roomCode = this.roomManager.createRoom();
      console.log('Room created:', roomCode);
      document.getElementById('roomCode').textContent = roomCode;
      
      const baseUrl = window.location.origin + window.location.pathname.replace('racing-3d-host.html', '');
      const joinUrl = baseUrl + 'controller-select.html?join=' + roomCode;
      QRCodeGenerator.generateCanvas(joinUrl, document.getElementById('qrCode'), 200);
      
      await this.connectToAbly();
      console.log('3D Racing host ready!');
    } catch (error) {
      console.error('Init error:', error);
      alert('Failed to initialize: ' + error.message);
    }
  }
  
  async connectToAbly() {
    try {
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = `racing3d-room-${this.roomManager.roomCode}`;
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
    
    if (this.players.has(playerId)) return;
    if (this.players.size >= 8) return;
    
    const playerNumber = this.players.size + 1;
    const playerName = `Racer ${playerNumber}`;
    const carColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
    
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      number: playerNumber,
      color: carColors[playerNumber - 1],
      position: 0,
      lap: 1,
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
      container.innerHTML = '<div style="color: #888;">Waiting for racers to join...</div>';
      return;
    }
    
    container.innerHTML = '';
    this.players.forEach((player) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <div style="font-size: 2em;">🏎️</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 1.1em;">${player.name}</div>
          <div style="opacity: 0.7;">Lane ${player.number}</div>
        </div>
        <div style="width: 20px; height: 20px; border-radius: 50%; background: #${player.color.toString(16).padStart(6, '0')};"></div>
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
    
    requirement.textContent = this.gameMode === 'ai' 
      ? 'Need at least 1 player (AI racers will fill remaining slots)' 
      : 'Need at least 2 players to start';
  }
}

// 3D Racing Game with Three.js
class Racing3DGame {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.getElementById('gameScreen').appendChild(this.renderer.domElement);
    
    this.racers = [];
    this.totalLaps = 3;
    this.trackLength = 300;
    this.trackWidth = 50;
    this.raceStartTime = 0;
    this.raceActive = false;
    this.countdown = 3;
    this.winner = null;
    
    this.setupScene();
    this.createTrack();
    this.initRacers();
    this.startCountdown();
    
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  setupScene() {
    // Sky
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 100, 500);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Camera position
    this.camera.position.set(0, 80, -80);
    this.camera.lookAt(0, 0, 50);
  }
  
  createTrack() {
    // Main track (oval)
    const trackGeometry = new THREE.PlaneGeometry(this.trackWidth, this.trackLength);
    const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.receiveShadow = true;
    this.scene.add(track);
    
    // Lane markings
    for (let i = 1; i < 8; i++) {
      const laneX = -this.trackWidth / 2 + (this.trackWidth / 8) * i;
      const lineGeometry = new THREE.BoxGeometry(0.2, 0.1, this.trackLength);
      const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      line.position.set(laneX, 0, 0);
      this.scene.add(line);
    }
    
    // Start/Finish line
    const finishGeometry = new THREE.BoxGeometry(this.trackWidth, 0.2, 2);
    const finishMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.position.set(0, 0.1, -this.trackLength / 2 + 5);
    this.scene.add(finishLine);
    
    // Checkered pattern on finish line
    for (let i = 0; i < 10; i++) {
      const checker = new THREE.Mesh(
        new THREE.BoxGeometry(this.trackWidth / 10, 0.3, 2),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x000000 : 0xffffff })
      );
      checker.position.set(-this.trackWidth / 2 + (this.trackWidth / 10) * i + this.trackWidth / 20, 0.1, -this.trackLength / 2 + 5);
      this.scene.add(checker);
    }
  }
  
  initRacers() {
    let laneIndex = 0;
    const laneWidth = this.trackWidth / 8;
    
    // Add human players
    this.host.players.forEach((player, playerId) => {
      const laneX = -this.trackWidth / 2 + laneWidth * laneIndex + laneWidth / 2;
      this.racers.push(this.createCar(playerId, player.name, player.color, laneX, laneIndex));
      laneIndex++;
    });
    
    // Add AI racers
    if (this.host.gameMode === 'ai') {
      const carColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
      while (laneIndex < 8) {
        const laneX = -this.trackWidth / 2 + laneWidth * laneIndex + laneWidth / 2;
        this.racers.push(this.createCar(
          'ai-' + laneIndex,
          `AI ${laneIndex + 1}`,
          carColors[laneIndex],
          laneX,
          laneIndex,
          true,
          0.3 + Math.random() * 0.3
        ));
        laneIndex++;
      }
    }
  }
  
  createCar(id, name, color, laneX, laneIndex, isAI = false, aiSpeed = 0) {
    const carGroup = new THREE.Group();
    
    // Car body
    const bodyGeometry = new THREE.BoxGeometry(3, 1.5, 5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    carGroup.add(body);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const wheelPositions = [
      [-1.2, -0.5, 1.5],
      [1.2, -0.5, 1.5],
      [-1.2, -0.5, -1.5],
      [1.2, -0.5, -1.5]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      carGroup.add(wheel);
    });
    
    carGroup.position.set(laneX, 1, -this.trackLength / 2 + 10);
    this.scene.add(carGroup);
    
    return {
      id,
      name,
      mesh: carGroup,
      lane: laneIndex,
      laneX,
      speed: 0,
      position: 0,
      lap: 1,
      isAI,
      aiSpeed,
      steering: 0,
      finished: false,
      finishTime: 0
    };
  }
  
  startCountdown() {
    const overlay = document.getElementById('countdownOverlay');
    const countInterval = setInterval(() => {
      if (this.countdown === 0) {
        clearInterval(countInterval);
        overlay.textContent = 'GO!';
        overlay.style.color = '#00ff00';
        setTimeout(() => {
          overlay.style.display = 'none';
          this.startRace();
        }, 500);
      } else {
        overlay.textContent = this.countdown;
        this.countdown--;
      }
    }, 1000);
    
    this.animate();
  }
  
  startRace() {
    this.raceActive = true;
    this.raceStartTime = Date.now();
    
    this.host.channel.publish('raceStarted', { timestamp: Date.now() });
    
    // Subscribe to player controls
    this.host.channel.subscribe('racerControl', (message) => {
      this.handleRacerControl(message.data);
    });
  }
  
  handleRacerControl(data) {
    const racer = this.racers.find(r => r.id === data.playerId);
    if (racer && !racer.finished && this.raceActive) {
      racer.steering = data.steering; // -1 to 1
      racer.speed = Math.max(0, Math.min(data.speed, 2)); // 0 to 2
    }
  }
  
  update() {
    if (!this.raceActive) return;
    
    let allFinished = true;
    
    this.racers.forEach(racer => {
      if (racer.finished) return;
      allFinished = false;
      
      if (racer.isAI) {
        // AI control
        racer.speed = racer.aiSpeed;
        racer.steering = (Math.sin(Date.now() / 1000) * 0.1);
      }
      
      // Update position
      racer.position += racer.speed;
      const zPos = -this.trackLength / 2 + 10 + racer.position;
      
      // Apply steering (with bounds)
      const targetX = racer.laneX + racer.steering * 2;
      const minX = -this.trackWidth / 2 + 2;
      const maxX = this.trackWidth / 2 - 2;
      racer.mesh.position.x = Math.max(minX, Math.min(maxX, targetX));
      racer.mesh.position.z = zPos;
      
      // Rotation for steering effect
      racer.mesh.rotation.y = -racer.steering * 0.3;
      
      // Check lap completion
      if (racer.position >= this.trackLength - 20) {
        racer.position = 0;
        racer.lap++;
        
        if (racer.lap > this.totalLaps) {
          racer.finished = true;
          racer.finishTime = Date.now() - this.raceStartTime;
          
          if (!this.winner) {
            this.winner = racer;
          }
          
          this.host.channel.publish('racerFinished', {
            racerId: racer.id,
            name: racer.name,
            time: racer.finishTime
          });
        }
      }
    });
    
    this.updateLeaderboard();
    
    if (allFinished) {
      this.endRace();
    }
  }
  
  updateLeaderboard() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap;
      return b.position - a.position;
    });
    
    const leaderboard = document.getElementById('leaderboard');
    leaderboard.innerHTML = sorted.slice(0, 5).map((racer, i) => `
      <div class="leaderboard-item">
        <span>${i + 1}. ${racer.name}</span>
        <span>Lap ${racer.lap}</span>
      </div>
    `).join('');
    
    // Update lap counter for first racer
    if (sorted[0]) {
      document.getElementById('currentLap').textContent = sorted[0].lap;
    }
  }
  
  endRace() {
    this.raceActive = false;
    
    setTimeout(() => {
      document.getElementById('winnerName').textContent = this.winner.name + ' Wins!';
      document.getElementById('winnerOverlay').classList.add('active');
    }, 2000);
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    this.update();
    this.renderer.render(this.scene, this.camera);
  }
  
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Global
let racing3DHost;

window.addEventListener('load', () => {
  racing3DHost = new Racing3DHost();
});

function select3DRacingMode(mode) {
  if (!racing3DHost) return;
  
  racing3DHost.gameMode = mode;
  
  document.getElementById('modeMultiplayer').classList.toggle('selected', mode === 'multiplayer');
  document.getElementById('modeAI').classList.toggle('selected', mode === 'ai');
  
  racing3DHost.updateStartButton();
}

function start3DRace() {
  if (!racing3DHost) return;
  
  const minPlayers = racing3DHost.gameMode === 'ai' ? 1 : 2;
  if (racing3DHost.players.size < minPlayers) {
    alert(`Need at least ${minPlayers} player(s) to start!`);
    return;
  }
  
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.add('active');
  
  racing3DHost.game = new Racing3DGame(racing3DHost);
}

function quit3DRaceToMenu() {
  if (confirm('Are you sure you want to quit the race?')) {
    if (racing3DHost && racing3DHost.channel) {
      racing3DHost.channel.publish('raceEnded', { quit: true });
    }
    
    location.reload();
  }
}
