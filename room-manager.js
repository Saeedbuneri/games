// Room Management System
class RoomManager {
  constructor() {
    this.roomCode = null;
    this.isHost = false;
  }

  // Generate unique room code
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar looking chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Validate room code format
  isValidCode(code) {
    return /^[A-Z0-9]{6}$/.test(code);
  }

  // Create new room
  createRoom() {
    this.roomCode = this.generateRoomCode();
    this.isHost = true;
    return this.roomCode;
  }

  // Join existing room
  joinRoom(code) {
    if (this.isValidCode(code.toUpperCase())) {
      this.roomCode = code.toUpperCase();
      this.isHost = false;
      return true;
    }
    return false;
  }

  // Get channel name from room code
  getChannelName() {
    return `badminton-room-${this.roomCode}`;
  }
}

// QR Code Generator (minimal implementation)
class QRCodeGenerator {
  static generate(text, size = 256) {
    // Using Google Charts API for QR generation (no dependencies)
    const encoded = encodeURIComponent(text);
    return `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encoded}&choe=UTF-8`;
  }

  static generateCanvas(text, container, size = 256) {
    const img = document.createElement('img');
    img.src = this.generate(text, size);
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.style.imageRendering = 'pixelated';
    container.innerHTML = '';
    container.appendChild(img);
    return img;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RoomManager, QRCodeGenerator };
}
