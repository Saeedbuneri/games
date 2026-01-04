// Ping Pong Host Logic
class PingPongHost {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.players = new Map(); // playerId -> { side, name, y }
    
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.gameStarted = false;
    this.score1 = 0;
    this.score2 = 0;
    
    // Game constants
    this.paddleWidth = 15;
    this.paddleHeight = 100;
    this.ballSize = 10;
    
    // Game state
    this.p1 = { y: 0, targetY: 0 };
    this.p2 = { y: 0, targetY: 0 };
    this.ball = { x: 0, y: 0, vx: 0, vy: 0 };
    
    this.init();
  }
  
  async init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Setup Ably
    await CONFIG.loadFromEnvironment();
    this.roomCode = this.roomManager.createRoom();
    document.getElementById('roomCode').textContent = this.roomCode;
    
    this.generateQR();
    await this.setupAbly();
    
    document.getElementById('startBtn').addEventListener('click', () => this.startGame());
  }
  
  resizeCanvas() {
    this.canvas.width = 800;
    this.canvas.height = 500;
    this.resetPositions();
  }
  
  resetPositions() {
    this.p1.y = this.canvas.height / 2 - this.paddleHeight / 2;
    this.p2.y = this.canvas.height / 2 - this.paddleHeight / 2;
    this.resetBall();
  }
  
  resetBall() {
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    const speed = 5;
    const angle = (Math.random() * Math.PI / 2) - Math.PI / 4; // -45 to 45 degrees
    const direction = Math.random() > 0.5 ? 1 : -1;
    this.ball.vx = Math.cos(angle) * speed * direction;
    this.ball.vy = Math.sin(angle) * speed;
  }
  
  generateQR() {
    const baseUrl = window.location.origin + window.location.pathname.replace('ping-pong-host.html', '');
    const joinUrl = baseUrl + 'ping-pong-controller.html?join=' + this.roomCode;
    
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: joinUrl,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff'
    });
  }
  
  async setupAbly() {
    this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
    this.channel = this.ably.channels.get(`ping-pong-${this.roomCode}`);
    
    this.channel.subscribe('player-joined', (msg) => this.handlePlayerJoined(msg.data));
    this.channel.subscribe('controller-input', (msg) => this.handleInput(msg.data));
  }
  
  handlePlayerJoined(data) {
    if (this.players.size >= 2) return;
    
    const side = this.players.size === 0 ? 'left' : 'right';
    this.players.set(data.playerId, {
      id: data.playerId,
      side: side,
      name: `Player ${this.players.size + 1}`
    });
    
    const slot = document.getElementById(`player${side === 'left' ? 1 : 2}Slot`);
    slot.textContent = `Player ${side === 'left' ? 1 : 2} Joined!`;
    slot.classList.add('ready');
    
    // Notify player of their side
    this.channel.publish('side-assigned', {
      playerId: data.playerId,
      side: side
    });
    
    if (this.players.size === 2) {
      document.getElementById('startBtn').disabled = false;
    }
  }
  
  handleInput(data) {
    const player = this.players.get(data.playerId);
    if (!player) return;
    
    if (player.side === 'left') {
      // Map normalized -1 to 1 to canvas height
      this.p1.targetY = (data.y + 1) / 2 * (this.canvas.height - this.paddleHeight);
    } else {
      this.p2.targetY = (data.y + 1) / 2 * (this.canvas.height - this.paddleHeight);
    }
  }
  
  startGame() {
    this.gameStarted = true;
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    this.channel.publish('game-start', {});
    this.gameLoop();
  }
  
  gameLoop() {
    if (!this.gameStarted) return;
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    // Smooth paddle movement
    this.p1.y += (this.p1.targetY - this.p1.y) * 0.2;
    this.p2.y += (this.p2.targetY - this.p2.y) * 0.2;
    
    // Ball movement
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;
    
    // Wall bounce (top/bottom)
    if (this.ball.y <= 0 || this.ball.y >= this.canvas.height - this.ballSize) {
      this.ball.vy *= -1;
    }
    
    // Paddle collision (left)
    if (this.ball.x <= this.paddleWidth) {
      if (this.ball.y + this.ballSize >= this.p1.y && this.ball.y <= this.p1.y + this.paddleHeight) {
        this.ball.vx *= -1.1; // Speed up slightly
        this.ball.x = this.paddleWidth;
        // Add spin based on where it hit the paddle
        const hitPos = (this.ball.y - (this.p1.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
        this.ball.vy += hitPos * 2;
      } else if (this.ball.x < 0) {
        this.score2++;
        this.updateScore();
        this.resetBall();
      }
    }
    
    // Paddle collision (right)
    if (this.ball.x >= this.canvas.width - this.paddleWidth - this.ballSize) {
      if (this.ball.y + this.ballSize >= this.p2.y && this.ball.y <= this.p2.y + this.paddleHeight) {
        this.ball.vx *= -1.1;
        this.ball.x = this.canvas.width - this.paddleWidth - this.ballSize;
        const hitPos = (this.ball.y - (this.p2.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
        this.ball.vy += hitPos * 2;
      } else if (this.ball.x > this.canvas.width) {
        this.score1++;
        this.updateScore();
        this.resetBall();
      }
    }
  }
  
  updateScore() {
    document.getElementById('score1').textContent = this.score1;
    document.getElementById('score2').textContent = this.score2;
    this.channel.publish('score-update', { s1: this.score1, s2: this.score2 });
  }
  
  render() {
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Center line
    this.ctx.setLineDash([10, 10]);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Paddles
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(0, this.p1.y, this.paddleWidth, this.paddleHeight);
    
    this.ctx.fillStyle = '#f472b6';
    this.ctx.fillRect(this.canvas.width - this.paddleWidth, this.p2.y, this.paddleWidth, this.paddleHeight);
    
    // Ball
    this.ctx.fillStyle = 'white';
    this.ctx.beginPath();
    this.ctx.arc(this.ball.x + this.ballSize / 2, this.ball.y + this.ballSize / 2, this.ballSize / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }
}

window.addEventListener('load', () => new PingPongHost());
