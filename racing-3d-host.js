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
    this.trackRadius = 80;
    this.trackLength = Math.PI * 2 * this.trackRadius; // Circumference
    this.trackWidth = 60;
    this.raceStartTime = 0;
    this.raceActive = false;
    this.countdown = 3;
    this.winner = null;
    
    this.setupScene();
    this.createSimpleTrack();
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
  
  createSimpleTrack() {
    // Create circular track
    const trackGeometry = new THREE.RingGeometry(this.trackRadius - this.trackWidth/2, this.trackRadius + this.trackWidth/2, 64);
    const trackMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.2
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.receiveShadow = true;
    this.scene.add(track);
    
    // Lane markings (4 lanes)
    for (let i = 1; i < 4; i++) {
      const laneRadius = this.trackRadius - this.trackWidth/2 + (this.trackWidth / 4) * i;
      const laneGeometry = new THREE.RingGeometry(laneRadius - 0.3, laneRadius + 0.3, 64);
      const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const lane = new THREE.Mesh(laneGeometry, laneMaterial);
      lane.rotation.x = -Math.PI / 2;
      lane.position.y = 0.1;
      this.scene.add(lane);
    }
    
    // Start/Finish line
    const finishGeometry = new THREE.BoxGeometry(this.trackWidth, 0.5, 4);
    const finishMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.5
    });
    const finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.position.set(0, 0.3, -this.trackRadius);
    this.scene.add(finishLine);
    
    // Checkered finish line pattern
    for (let i = 0; i < 12; i++) {
      const checker = new THREE.Mesh(
        new THREE.BoxGeometry(this.trackWidth / 12, 0.6, 4),
        new THREE.MeshStandardMaterial({ 
          color: i % 2 === 0 ? 0x000000 : 0xffffff,
          emissive: i % 2 === 0 ? 0x000000 : 0xffffff,
          emissiveIntensity: 0.3
        })
      );
      checker.position.set(-this.trackWidth/2 + (this.trackWidth/12) * i + this.trackWidth/24, 0.4, -this.trackRadius);
      this.scene.add(checker);
    }
    
    // Add barriers
    this.createSimpleBarriers();
  }
  
  createSimpleBarriers() {
    const barrierGeometry = new THREE.BoxGeometry(2, 4, 2);
    const innerMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.3
    });
    const outerMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.3
    });
    
    const numBarriers = 32;
    for (let i = 0; i < numBarriers; i++) {
      const angle = (i / numBarriers) * Math.PI * 2;
      
      // Inner barrier
      const innerBarrier = new THREE.Mesh(barrierGeometry, innerMaterial);
      const innerRadius = this.trackRadius - this.trackWidth/2 - 3;
      innerBarrier.position.set(
        Math.sin(angle) * innerRadius,
        2,
        Math.cos(angle) * innerRadius
      );
      innerBarrier.rotation.y = -angle;
      innerBarrier.castShadow = true;
      this.scene.add(innerBarrier);
      
      // Outer barrier
      const outerBarrier = new THREE.Mesh(barrierGeometry, outerMaterial);
      const outerRadius = this.trackRadius + this.trackWidth/2 + 3;
      outerBarrier.position.set(
        Math.sin(angle) * outerRadius,
        2,
        Math.cos(angle) * outerRadius
      );
      outerBarrier.rotation.y = -angle;
      outerBarrier.castShadow = true;
      this.scene.add(outerBarrier);
    }
  }
  
  initRacers() {
    let laneIndex = 0;
    const numLanes = 8;
    
    // Add human players
    this.host.players.forEach((player, playerId) => {
      this.racers.push(this.createCar(playerId, player.name, player.color, laneIndex, numLanes));
      laneIndex++;
    });
    
    // Add AI racers
    if (this.host.gameMode === 'ai') {
      const carColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
      while (laneIndex < numLanes) {
        this.racers.push(this.createCar(
          'ai-' + laneIndex,
          `AI ${laneIndex + 1}`,
          carColors[laneIndex],
          laneIndex,
          numLanes,
          true,
          1.2 + Math.random() * 0.8
        ));
        laneIndex++;
      }
    }
  }
  
  createCar(id, name, color, laneIndex, totalLanes, isAI = false, aiSpeed = 0) {
    const carGroup = new THREE.Group();
    
    // Simpler car body
    const bodyGeometry = new THREE.BoxGeometry(4, 2, 6);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: color, 
      metalness: 0.7, 
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    body.castShadow = true;
    carGroup.add(body);
    
    // Roof
    const roofGeometry = new THREE.BoxGeometry(3.5, 1.2, 3.5);
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
    roof.position.y = 2.5;
    roof.castShadow = true;
    carGroup.add(roof);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.8, 12);
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,
      metalness: 0.3,
      roughness: 0.8
    });
    const wheelPositions = [
      [-2, 0.7, 2],
      [2, 0.7, 2],
      [-2, 0.7, -2],
      [2, 0.7, -2]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      carGroup.add(wheel);
    });
    
    // Calculate starting position on track
    const laneRadius = this.trackRadius - this.trackWidth/2 + (this.trackWidth / totalLanes) * laneIndex + (this.trackWidth / totalLanes / 2);
    const startAngle = 0; // Start at finish line
    
    carGroup.position.set(
      Math.sin(startAngle) * laneRadius,
      0,
      Math.cos(startAngle) * laneRadius
    );
    carGroup.rotation.y = -startAngle;
    
    this.scene.add(carGroup);
    
    return {
      id,
      name,
      mesh: carGroup,
      lane: laneIndex,
      laneRadius,
      speed: 0,
      angle: startAngle,
      lap: 1,
      lastAngle: startAngle,
      isAI,
      aiSpeed,
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
      // Direct speed from tap control (0 to 3)
      racer.speed = Math.max(0, Math.min(data.speed, 3));
    }
  }
  
  update() {
    if (!this.raceActive) return;
    
    let allFinished = true;
    
    this.racers.forEach(racer => {
      if (racer.finished) return;
      allFinished = false;
      
      if (racer.isAI) {
        // AI constant speed with small variation
        racer.speed = racer.aiSpeed + Math.sin(Date.now() / 3000) * 0.2;
      }
      
      // Calculate angle increment based on speed
      // Speed 0-3, angle increment should be small
      const angleIncrement = (racer.speed / racer.laneRadius) * 0.1;
      const prevAngle = racer.angle;
      racer.angle += angleIncrement;
      
      // Wrap angle
      if (racer.angle >= Math.PI * 2) {
        racer.angle -= Math.PI * 2;
        
        // Lap detection: crossed from high angle to low angle
        if (prevAngle > Math.PI * 1.8) {
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
      }
      
      // Update car position on circular track
      racer.mesh.position.set(
        Math.sin(racer.angle) * racer.laneRadius,
        0,
        Math.cos(racer.angle) * racer.laneRadius
      );
      
      // Rotate car to face tangent direction (perpendicular to radius)
      // Add PI/2 to make car face forward along the circle
      racer.mesh.rotation.y = -racer.angle + Math.PI / 2;
      
      // Slight banking when moving fast
      racer.mesh.rotation.z = Math.min(racer.speed / 20, 0.2);
    });
    
    this.updateLeaderboard();
    this.updateCamera();
    
    if (allFinished) {
      this.endRace();
    }
  }
  
  updateCamera() {
    // Follow the leader from above and behind
    if (this.racers.length > 0) {
      const sorted = [...this.racers].sort((a, b) => {
        if (a.lap !== b.lap) return b.lap - a.lap;
        return b.angle - a.angle;
      });
      
      const leader = sorted[0];
      if (leader) {
        // Calculate camera position behind and above the leader
        const cameraRadius = leader.laneRadius + 40;
        const cameraAngle = leader.angle - 0.3; // Slightly behind
        const targetPos = new THREE.Vector3(
          Math.sin(cameraAngle) * cameraRadius,
          60,
          Math.cos(cameraAngle) * cameraRadius
        );
        
        // Smooth camera movement
        this.camera.position.lerp(targetPos, 0.03);
        
        // Look at point ahead of leader
        const lookAheadAngle = leader.angle + 0.5;
        const lookAtPos = new THREE.Vector3(
          Math.sin(lookAheadAngle) * leader.laneRadius,
          0,
          Math.cos(lookAheadAngle) * leader.laneRadius
        );
        this.camera.lookAt(lookAtPos);
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
