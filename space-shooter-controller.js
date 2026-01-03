// Space Shooter Controller Logic
class SpaceShooterController {
  constructor() {
    this.roomManager = new RoomManager();
    this.ably = null;
    this.channel = null;
    this.playerId = 'player-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    this.playerSide = null;
    this.isConnected = false;
    this.gameStarted = false;
    this.health = 100;
    
    this.init();
  }
  
  init() {
    // Check for room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
      const input = document.getElementById('roomCodeInput');
      input.value = joinCode.toUpperCase();
      
      // Show notification
      setTimeout(() => {
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(102, 126, 234, 0.95);
          color: white;
          padding: 15px 25px;
          border-radius: 15px;
          font-weight: 600;
          z-index: 1000;
          animation: slideDown 0.3s ease-out;
        `;
        notification.textContent = `🚀 Ready to join battle ${joinCode}!`;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
      }, 500);
    }
    
    // Auto-uppercase room code input
    document.getElementById('roomCodeInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
    
    this.setupControls();
  }
  
  setupControls() {
    // Up button
    const btnUp = document.getElementById('btnUp');
    btnUp.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.sendAction('moveUp', true);
      btnUp.style.background = 'rgba(102, 126, 234, 0.6)';
    });
    btnUp.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.sendAction('moveUp', false);
      btnUp.style.background = 'rgba(102, 126, 234, 0.3)';
    });
    btnUp.addEventListener('mousedown', () => {
      this.sendAction('moveUp', true);
      btnUp.style.background = 'rgba(102, 126, 234, 0.6)';
    });
    btnUp.addEventListener('mouseup', () => {
      this.sendAction('moveUp', false);
      btnUp.style.background = 'rgba(102, 126, 234, 0.3)';
    });
    
    // Down button
    const btnDown = document.getElementById('btnDown');
    btnDown.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.sendAction('moveDown', true);
      btnDown.style.background = 'rgba(102, 126, 234, 0.6)';
    });
    btnDown.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.sendAction('moveDown', false);
      btnDown.style.background = 'rgba(102, 126, 234, 0.3)';
    });
    btnDown.addEventListener('mousedown', () => {
      this.sendAction('moveDown', true);
      btnDown.style.background = 'rgba(102, 126, 234, 0.6)';
    });
    btnDown.addEventListener('mouseup', () => {
      this.sendAction('moveDown', false);
      btnDown.style.background = 'rgba(102, 126, 234, 0.3)';
    });
    
    // Fire button
    const btnFire = document.getElementById('btnFire');
    btnFire.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.sendAction('shoot', true);
      this.triggerHaptic([10]);
    });
    btnFire.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.sendAction('shoot', false);
    });
    btnFire.addEventListener('mousedown', () => {
      this.sendAction('shoot', true);
    });
    btnFire.addEventListener('mouseup', () => {
      this.sendAction('shoot', false);
    });
  }
  
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }
  
  async connectToRoom(roomCode) {
    try {
      console.log('Connecting to space shooter room:', roomCode);
      
      // Load config from Vercel environment if deployed
      await CONFIG.loadFromEnvironment();
      
      this.ably = new Ably.Realtime(CONFIG.ABLY_API_KEY);
      const channelName = `space-shooter-room-${roomCode}`;
      this.channel = this.ably.channels.get(channelName);
      
      this.ably.connection.on('connected', () => {
        console.log('Connected to room:', roomCode);
        
        setTimeout(() => {
          console.log('Sending join request for player:', this.playerId);
          this.channel.publish('playerJoinRequest', {
            playerId: this.playerId
          });
        }, 1000);
      });
      
      // Listen for join acceptance
      this.channel.subscribe('playerJoinAccepted', (message) => {
        if (message.data.playerId === this.playerId) {
          this.onJoinAccepted(message.data);
        }
      });
      
      // Listen for game start
      this.channel.subscribe('gameStarted', () => {
        this.onGameStarted();
      });
      
      // Listen for game events
      this.channel.subscribe('gameEvent', (message) => {
        this.handleGameEvent(message.data);
      });
      
      // Listen for game end
      this.channel.subscribe('gameEnded', (message) => {
        this.onGameEnded(message.data);
      });
      
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }
  
  onJoinAccepted(data) {
    console.log('Join accepted!', data);
    this.isConnected = true;
    this.playerSide = data.side;
    
    const sideBadge = document.getElementById('sideBadge');
    const playerSideBadge = document.getElementById('playerSideBadge');
    
    const badgeText = `${data.side.toUpperCase()} SIDE - ${data.playerName}`;
    const badgeClass = data.side;
    
    sideBadge.textContent = badgeText;
    sideBadge.className = `side-badge ${badgeClass}`;
    
    playerSideBadge.textContent = badgeText;
    playerSideBadge.className = `side-badge ${badgeClass}`;
    
    document.getElementById('waitingMessage').textContent = 
      'Connected! Waiting for host to start battle...';
  }
  
  onGameStarted() {
    console.log('Game started!');
    this.gameStarted = true;
    this.showScreen('controllerScreen');
    this.triggerHaptic([20, 10, 20]);
  }
  
  handleGameEvent(event) {
    console.log('Game event:', event);
    
    switch (event.type) {
      case 'shoot':
        if (event.side === this.playerSide) {
          this.triggerHaptic([5]);
        }
        break;
        
      case 'hit':
        if (event.side === this.playerSide) {
          // You got hit
          this.health = event.health;
          this.updateHealth();
          this.triggerHaptic([50, 20, 50, 20, 50]);
          this.showHitFeedback();
        } else if (event.shooterSide === this.playerSide) {
          // You hit opponent
          this.showSuccessHit();
          this.triggerHaptic([20, 10, 20]);
        }
        break;
        
      case 'paused':
        this.showNotification('⏸️ Game Paused');
        break;
        
      case 'resumed':
        this.showNotification('▶️ Game Resumed');
        break;
        
      case 'restart':
        this.health = 100;
        this.updateHealth();
        this.showNotification('🔄 Game Restarted');
        break;
    }
  }
  
  showHitFeedback() {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(239, 68, 68, 0.9);
      color: white;
      padding: 30px 50px;
      border-radius: 20px;
      font-size: 2em;
      font-weight: 900;
      z-index: 2000;
      animation: hitPulse 0.5s ease-out;
      pointer-events: none;
    `;
    feedback.textContent = '💥 HIT! -10 HP';
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 500);
  }
  
  showSuccessHit() {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(16, 185, 129, 0.9);
      color: white;
      padding: 30px 50px;
      border-radius: 20px;
      font-size: 2em;
      font-weight: 900;
      z-index: 2000;
      animation: hitPulse 0.5s ease-out;
      pointer-events: none;
    `;
    feedback.textContent = '🎯 NICE SHOT!';
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 500);
  }
  
  showNotification(text) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(102, 126, 234, 0.95);
      color: white;
      padding: 15px 30px;
      border-radius: 15px;
      font-weight: 600;
      z-index: 2000;
      animation: slideDown 0.3s ease-out;
    `;
    notification.textContent = text;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 2000);
  }
  
  updateHealth() {
    const healthBar = document.getElementById('healthBar');
    const healthText = document.getElementById('healthText');
    
    healthBar.style.width = this.health + '%';
    healthText.textContent = this.health + '%';
    
    if (this.health < 30) {
      healthBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
    } else if (this.health < 60) {
      healthBar.style.background = 'linear-gradient(90deg, #fbbf24, #fcd34d)';
    }
  }
  
  onGameEnded(data) {
    console.log('Game ended!', data);
    this.gameStarted = false;
    
    // Check if game was quit
    if (data.quit) {
      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';
      overlay.innerHTML = `
        <div class="card">
          <h1 style="font-size: 2.5em; margin-bottom: 20px;">🚪 Game Ended</h1>
          <div style="font-size: 1.2em; margin: 20px 0;">
            Host quit the game
          </div>
          <button class="btn btn-primary" onclick="returnToLobby()">
            Return to Lobby
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
      return;
    }
    
    const winnerSide = data.winner;
    const didWin = winnerSide === this.playerSide;
    
    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    overlay.innerHTML = `
      <div class="card">
        <div style="font-size: 5em; margin-bottom: 20px; animation: bounce 1s ease-in-out infinite;">
          ${didWin ? '🏆' : '💥'}
        </div>
        <h1 style="font-size: 3em; margin-bottom: 20px; color: ${didWin ? '#10b981' : '#ef4444'};">
          ${didWin ? 'VICTORY!' : 'DEFEATED'}
        </h1>
        <div style="font-size: 1.3em; margin: 20px 0; opacity: 0.9;">
          ${didWin 
            ? `You defeated ${data.loserName}!` 
            : `${data.winnerName} defeated you!`
          }
        </div>
        
        <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 15px; margin: 30px 0;">
          <div style="font-size: 0.9em; opacity: 0.7; margin-bottom: 10px;">FINAL STATS</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: center;">
            <div>
              <div style="font-size: 0.9em; opacity: 0.7;">Your Score</div>
              <div style="font-size: 2.5em; font-weight: 900; color: #fbbf24;">
                ${this.playerSide === 'left' ? data.finalScores.left : data.finalScores.right}
              </div>
            </div>
            <div>
              <div style="font-size: 0.9em; opacity: 0.7;">Your Health</div>
              <div style="font-size: 2.5em; font-weight: 900; color: ${didWin ? '#10b981' : '#ef4444'};">
                ${this.playerSide === 'left' ? data.finalHealth.left : data.finalHealth.right}%
              </div>
            </div>
          </div>
        </div>
        
        <button class="btn btn-primary" onclick="returnToLobby()">
          Back to Lobby
        </button>
      </div>
      <style>
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
      </style>
    `;
    document.body.appendChild(overlay);
    
    this.triggerHaptic(didWin ? [20, 10, 20, 10, 20] : [100, 50, 100]);
  }
  
  sendAction(action, value) {
    if (!this.channel || !this.gameStarted) return;
    
    this.channel.publish('playerAction', {
      playerId: this.playerId,
      action: action,
      value: value
    });
  }
  
  triggerHaptic(pattern) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
  
  leaveGame() {
    if (this.channel && this.isConnected) {
      this.channel.publish('playerLeave', {
        playerId: this.playerId,
        side: this.playerSide
      });
    }
  }
}

// Global functions
let controller;

window.addEventListener('load', () => {
  controller = new SpaceShooterController();
});

async function joinRoom() {
  const code = document.getElementById('roomCodeInput').value.trim();
  
  if (!code || code.length !== 6) {
    alert('⚠️ Please enter a valid 6-character room code');
    return;
  }
  
  if (!controller.roomManager.joinRoom(code)) {
    alert('⚠️ Invalid room code format');
    return;
  }
  
  controller.showScreen('waitingScreen');
  
  const connected = await controller.connectToRoom(code);
  
  if (!connected) {
    alert('❌ Failed to connect to room. Please try again.');
    controller.showScreen('codeEntryScreen');
  }
}

function leaveGame() {
  if (confirm('Are you sure you want to leave the battle?')) {
    controller.leaveGame();
    window.location.href = window.location.pathname;
  }
}

function returnToLobby() {
  window.location.href = window.location.pathname;
}
