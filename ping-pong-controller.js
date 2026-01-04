// Ping Pong Controller Logic
class PingPongController {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    this.side = null;
    
    this.init();
  }
  
  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    if (joinCode) {
      document.getElementById('roomCodeInput').value = joinCode.toUpperCase();
    }
    
    document.getElementById('joinBtn').addEventListener('click', () => {
      const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
      if (code.length === 6) this.joinGame(code);
    });
    
    this.setupTouch();
  }
  
  async joinGame(code) {
    await CONFIG.loadFromEnvironment();
    this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
    this.channel = this.ably.channels.get(`ping-pong-${code}`);
    
    this.channel.subscribe('side-assigned', (msg) => {
      if (msg.data.playerId === this.playerId) {
        this.side = msg.data.side;
        document.getElementById('sideBadge').textContent = `Assigned Side: ${this.side.toUpperCase()}`;
        document.getElementById('sideBadge').className = `side-indicator side-${this.side}`;
        document.getElementById('playerSide').textContent = `SIDE: ${this.side.toUpperCase()}`;
      }
    });
    
    this.channel.subscribe('game-start', () => {
      this.showScreen('controllerScreen');
    });
    
    this.channel.subscribe('score-update', (msg) => {
      document.getElementById('scoreDisplay').textContent = `${msg.data.s1} - ${msg.data.s2}`;
      if (navigator.vibrate) navigator.vibrate(50);
    });
    
    this.channel.publish('player-joined', { playerId: this.playerId });
    this.showScreen('waitingScreen');
  }
  
  setupTouch() {
    const area = document.getElementById('touchArea');
    const handle = document.getElementById('handle');
    
    const handleTouch = (e) => {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const rect = area.getBoundingClientRect();
      
      // Calculate normalized Y (-1 to 1)
      let y = (touch.clientY - rect.top) / rect.height;
      y = Math.max(0, Math.min(1, y));
      
      // Update UI
      handle.style.top = (y * 100) + '%';
      handle.style.transform = 'translateY(-50%)';
      
      // Send to host (normalized -1 to 1)
      if (this.channel) {
        this.channel.publish('controller-input', {
          playerId: this.playerId,
          y: (y * 2) - 1
        });
      }
    };
    
    area.addEventListener('touchstart', handleTouch);
    area.addEventListener('touchmove', handleTouch);
    area.addEventListener('mousedown', (e) => {
      const move = (me) => handleTouch(me);
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      handleTouch(e);
    });
  }
  
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
}

window.addEventListener('load', () => new PingPongController());
