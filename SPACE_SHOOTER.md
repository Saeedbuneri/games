# 🚀 Space Shooter Game

## Overview
A smooth, engaging 2-player space shooter arcade game with multiplayer support using Ably real-time sync. Players control space rockets on the left and right sides and battle each other!

## Features

### 🎮 Game Modes
- **Player vs Player (PvP)**: Two players battle against each other
- **vs AI Bot**: Single player mode with intelligent bot opponent

### 🚀 Gameplay
- **Left & Right Positioning**: Players automatically assigned to left or right side
- **Smooth Controls**: 
  - Move Up/Down with directional buttons
  - Fire bullets with dedicated fire button
- **Health System**: Each player starts with 100 health
- **Score Tracking**: Points awarded for each hit
- **Visual Effects**:
  - Starfield background with parallax scrolling
  - Muzzle flash particles
  - Explosion effects
  - Rocket engine flames
  - Screen shake on hits

### 📱 Controller Features
- Touch-optimized buttons for mobile
- Haptic feedback for:
  - Shooting
  - Getting hit
  - Game events
- Real-time health display
- Side indicator (left/right)
- Leave game functionality

### 🖥️ Host Screen Features
- Room code generation with QR code
- Game mode selection (PvP or Bot)
- Player list with side assignment
- Real-time health bars
- Score display
- Smooth 60fps gameplay

## How to Play

### For Host (TV/Computer):
1. Open `start.html` and select "Main Screen"
2. Choose "Space Shooter"
3. Select game mode (PvP or vs AI)
4. Share room code or QR code with players
5. Wait for players to join
6. Click "START GAME" when ready

### For Controllers (Phone):
1. Open `start.html` on your phone
2. Select "Controller"
3. Scan QR code OR enter room code manually
4. Wait for game to start
5. Use buttons to move and fire!

### Controls:
- **▲ UP**: Move rocket up
- **▼ DOWN**: Move rocket down
- **🔥 FIRE**: Shoot bullets

## Technical Features

### Real-time Sync
- Ably Realtime for instant communication
- Player action broadcasting
- Game state synchronization
- Disconnect handling

### Performance
- Canvas-based rendering
- 60 FPS target frame rate
- Optimized particle system
- Smooth animations

### AI Bot
- Tracks opponent position
- Smart movement decisions
- Adaptive shooting patterns
- Challenging but fair difficulty

## Game Mechanics

### Combat
- Each bullet hit deals 10 damage
- Fire rate: 200ms cooldown between shots
- Bullets travel at 800 units/second
- Collision detection with rockets

### Victory Conditions
- First player to reduce opponent's health to 0 wins
- Score determines performance
- Game over screen with final stats

## Files Structure
```
space-shooter-host.html       - Main game screen
space-shooter-host.js         - Game logic and host controller
space-shooter-controller.html - Mobile controller UI
space-shooter-controller.js   - Controller input handler
```

## Integration
The game seamlessly integrates with the existing game selection system in `start.html`. Players can choose between Badminton and Space Shooter from the main menu.

## Browser Compatibility
- Modern browsers with Canvas support
- Mobile Safari (iOS 13+)
- Chrome/Edge (Android & Desktop)
- Firefox

## Future Enhancements
- Power-ups
- Multiple rocket types
- Shields and special abilities
- Tournament mode
- Team battles (4 players)
- Customizable rocket skins

---

**Enjoy the battle! 🚀💥**
