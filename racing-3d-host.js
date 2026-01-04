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
    // Sky gradient
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 200, 800);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(100, 150, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -150;
    sunLight.shadow.camera.right = 150;
    sunLight.shadow.camera.top = 150;
    sunLight.shadow.camera.bottom = -150;
    this.scene.add(sunLight);
    
    // Large ground plane
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x228B22, 
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Camera setup - bird's eye view following race
    this.camera.position.set(0, 120, -100);
    this.camera.lookAt(0, 0, 0);
  }
  
  createTrack() {
    // Create oval track with curves
    this.trackCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -100),
      new THREE.Vector3(80, 0, -80),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(80, 0, 80),
      new THREE.Vector3(0, 0, 100),
      new THREE.Vector3(-80, 0, 80),
      new THREE.Vector3(-100, 0, 0),
      new THREE.Vector3(-80, 0, -80),
      new THREE.Vector3(0, 0, -100)
    ], true);
    
    this.trackPoints = this.trackCurve.getPoints(200);
    this.trackLength = 200;
    
    // Create track mesh
    const trackShape = new THREE.Shape();
    trackShape.moveTo(-this.trackWidth / 2, 0);
    trackShape.lineTo(this.trackWidth / 2, 0);
    trackShape.lineTo(this.trackWidth / 2, 1);
    trackShape.lineTo(-this.trackWidth / 2, 1);
    
    const extrudeSettings = {
      steps: 200,
      bevelEnabled: false,
      extrudePath: this.trackCurve
    };
    
    const trackGeometry = new THREE.ExtrudeGeometry(trackShape, extrudeSettings);
    const trackMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x444444,
      roughness: 0.7,
      metalness: 0.3
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.receiveShadow = true;
    this.scene.add(track);
    
    // Add barriers on both sides
    this.createBarriers();
    
    // Add start/finish line
    const finishGeometry = new THREE.BoxGeometry(this.trackWidth, 0.5, 5);
    const finishMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.3
    });
    const finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.position.copy(this.trackPoints[0]);
    finishLine.position.y = 0.5;
    this.scene.add(finishLine);
    
    // Add checkered pattern
    for (let i = 0; i < 10; i++) {
      const checker = new THREE.Mesh(
        new THREE.BoxGeometry(this.trackWidth / 10, 0.6, 5),
        new THREE.MeshStandardMaterial({ 
          color: i % 2 === 0 ? 0x000000 : 0xffffff,
          emissive: i % 2 === 0 ? 0x000000 : 0xffffff,
          emissiveIntensity: 0.2
        })
      );
      checker.position.copy(this.trackPoints[0]);
      checker.position.x += (-this.trackWidth / 2) + (this.trackWidth / 10) * i + (this.trackWidth / 20);
      checker.position.y = 0.6;
      this.scene.add(checker);
    }
  }
  
  createBarriers() {
    // Create barriers along the track
    const barrierGeometry = new THREE.BoxGeometry(2, 5, 2);
    const barrierMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.2
    });
    
    for (let i = 0; i < this.trackPoints.length; i += 5) {
      const point = this.trackPoints[i];
      const nextPoint = this.trackPoints[(i + 1) % this.trackPoints.length];
      const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);
      
      // Inner barrier
      const innerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      innerBarrier.position.copy(point);
      innerBarrier.position.add(perpendicular.clone().multiplyScalar(-this.trackWidth / 2 - 2));
      innerBarrier.position.y = 2.5;
      innerBarrier.castShadow = true;
      this.scene.add(innerBarrier);
      
      // Outer barrier
      const outerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial.clone());
      outerBarrier.material.color.set(0xffff00);
      outerBarrier.material.emissive.set(0xffff00);
      outerBarrier.position.copy(point);
      outerBarrier.position.add(perpendicular.clone().multiplyScalar(this.trackWidth / 2 + 2));
      outerBarrier.position.y = 2.5;
      outerBarrier.castShadow = true;
      this.scene.add(outerBarrier);
    }
  }
  
  initRacers() {
    let laneIndex = 0;
    
    // Add human players
    this.host.players.forEach((player, playerId) => {
      this.racers.push(this.createCar(playerId, player.name, player.color, laneIndex));
      laneIndex++;
    });
    
    // Add AI racers
    if (this.host.gameMode === 'ai') {
      const carColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
      while (laneIndex < 8) {
        this.racers.push(this.createCar(
          'ai-' + laneIndex,
          `AI ${laneIndex + 1}`,
          carColors[laneIndex],
          laneIndex,
          true,
          0.8 + Math.random() * 0.6
        ));
        laneIndex++;
      }
    }
  }
  
  createCar(id, name, color, laneIndex, isAI = false, aiSpeed = 0) {
    const carGroup = new THREE.Group();
    
    // Car body (more detailed)
    const bodyGeometry = new THREE.BoxGeometry(4, 2, 7);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: color, 
      metalness: 0.8, 
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.5;
    body.castShadow = true;
    carGroup.add(body);
    
    // Roof
    const roofGeometry = new THREE.BoxGeometry(3.5, 1.5, 4);
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
    roof.position.y = 3;
    roof.castShadow = true;
    carGroup.add(roof);
    
    // Windows
    const windowMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x111111,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.7
    });
    const windowGeometry = new THREE.BoxGeometry(3.4, 1.4, 3.9);
    const windows = new THREE.Mesh(windowGeometry, windowMaterial);
    windows.position.y = 3;
    carGroup.add(windows);
    
    // Wheels (bigger and more visible)
    const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.8, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,
      metalness: 0.5,
      roughness: 0.7
    });
    const wheelPositions = [
      [-2, 0.8, 2.5],
      [2, 0.8, 2.5],
      [-2, 0.8, -2.5],
      [2, 0.8, -2.5]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      carGroup.add(wheel);
    });
    
    // Headlights
    const headlightGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const headlightMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 1
    });
    [-1.5, 1.5].forEach(x => {
      const light = new THREE.Mesh(headlightGeometry, headlightMaterial);
      light.position.set(x, 1.5, 3.7);
      carGroup.add(light);
    });
    
    // Start position on track
    const startPoint = this.trackPoints[laneIndex * 3];
    carGroup.position.copy(startPoint);
    carGroup.position.y = 0;
    
    this.scene.add(carGroup);
    
    return {
      id,
      name,
      mesh: carGroup,
      lane: laneIndex,
      speed: 0,
      trackPosition: laneIndex * 3,
      lap: 1,
      isAI,
      aiSpeed,
      lastCheckpoint: 0,
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
      racer.speed = Math.max(0, Math.min(data.speed * 1.5, 3)); // 0 to 3
    }
  }
  
  update() {
    if (!this.raceActive) return;
    
    let allFinished = true;
    
    this.racers.forEach(racer => {
      if (racer.finished) return;
      allFinished = false;
      
      if (racer.isAI) {
        // AI control with slight variation
        racer.speed = racer.aiSpeed + Math.sin(Date.now() / 2000) * 0.1;
      }
      
      // Move along track
      racer.trackPosition += racer.speed;
      
      // Wrap around track
      if (racer.trackPosition >= this.trackLength) {
        racer.trackPosition -= this.trackLength;
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
      
      // Update car position and rotation on track
      const currentIndex = Math.floor(racer.trackPosition);
      const nextIndex = (currentIndex + 1) % this.trackLength;
      const t = racer.trackPosition - currentIndex;
      
      const currentPoint = this.trackPoints[currentIndex];
      const nextPoint = this.trackPoints[nextIndex];
      
      // Interpolate position
      racer.mesh.position.lerpVectors(currentPoint, nextPoint, t);
      racer.mesh.position.y = 0;
      
      // Calculate rotation to face direction of movement
      const direction = new THREE.Vector3().subVectors(nextPoint, currentPoint).normalize();
      const angle = Math.atan2(direction.x, direction.z);
      racer.mesh.rotation.y = angle;
      
      // Tilt car slightly when turning
      const nextNextIndex = (nextIndex + 1) % this.trackLength;
      const nextNextPoint = this.trackPoints[nextNextIndex];
      const nextDirection = new THREE.Vector3().subVectors(nextNextPoint, nextPoint).normalize();
      const turnAngle = Math.atan2(nextDirection.x, nextDirection.z) - angle;
      racer.mesh.rotation.z = -turnAngle * 0.3;
    });
    
    this.updateLeaderboard();
    this.updateCamera();
    
    if (allFinished) {
      this.endRace();
    }
  }
  
  updateCamera() {
    // Dynamic camera following the leader
    if (this.racers.length > 0) {
      const sorted = [...this.racers].sort((a, b) => {
        if (a.lap !== b.lap) return b.lap - a.lap;
        return b.trackPosition - a.trackPosition;
      });
      
      const leader = sorted[0];
      if (leader) {
        const targetPos = leader.mesh.position.clone();
        targetPos.y = 100;
        targetPos.z -= 80;
        
        // Smooth camera movement
        this.camera.position.lerp(targetPos, 0.05);
        this.camera.lookAt(leader.mesh.position.x, 0, leader.mesh.position.z);
      }
    }
  }
  
  updateLeaderboard() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap;
      return b.trackPosition - a.trackPosition;
    });
    
    const leaderboard = document.getElementById('leaderboard');
    leaderboard.innerHTML = sorted.slice(0, 8).map((racer, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const medal = i < 3 ? medals[i] : `${i + 1}.`;
      return `
        <div class="leaderboard-item">
          <span>${medal} ${racer.name}</span>
          <span>Lap ${racer.lap}/${this.totalLaps}</span>
        </div>
      `;
    }).join('');
    
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
