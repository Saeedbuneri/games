# 🏸 Badminton Racket Game

Transform your phone into a high-performance badminton racket using real sensor data! This game uses your phone's accelerometer, gyroscope, and magnetometer to detect swing speed, angles, and timing for an incredibly immersive experience.

## 🎮 Features

- **Real Sensor-Based Gameplay**: Uses accelerometer for power detection, gyroscope for swing angles, and real motion physics
- **Multiple Swing Types**: 
  - 💥 **Smash**: High-speed overhead attacks with screen shake
  - 🎯 **Drop Shot**: Gentle, precise shots
  - 🔄 **Slice Shots**: Wrist rotation creates curved shuttlecock trajectories
- **Haptic Feedback**: Feel every hit with vibration patterns
- **Multiplayer Support**: 2 players on one TV using their phones as rackets
- **Predictive Physics**: 100ms latency compensation for seamless gameplay
- **Low-Pass Filtering**: Smooth sensor noise for accurate detection

## 📋 Requirements

- **Big Screen**: A computer/TV with a modern web browser (Chrome, Firefox, Edge)
- **Phones**: 2 smartphones with motion sensors (iOS/Android)
- **Network**: All devices on the same WiFi network
- **Ably Account**: Free real-time messaging service (see setup below)

## 🚀 Quick Start

### Deployment Options

You can run this game locally or deploy it to Vercel for easy access from anywhere!

#### Option A: Deploy to Vercel (Recommended) ⭐

1. **Get Ably API Key**:
   - Go to [Ably.com](https://ably.com/) and create a free account
   - Create a new app and copy your API key

2. **Configure the Game**:
   - Open `config.js` and replace `YOUR_ABLY_API_KEY_HERE` with your Ably API key

3. **Deploy to Vercel**:
   ```bash
   # Install Vercel CLI (one-time)
   npm install -g vercel
   
   # Deploy (from the game directory)
   vercel
   ```
   
4. **Access Your Game**:
   - Vercel will give you a URL like: `https://your-game.vercel.app`
   - Open this URL on your TV/computer for the big screen
   - Open the same URL on phones for controllers
   - Click "Big Screen" or "Phone Controller" as needed

**Benefits of Vercel Deployment**:
- ✅ HTTPS enabled (required for iOS sensors)
- ✅ Access from anywhere (no local server needed)
- ✅ Fast global CDN
- ✅ Automatic sensor permissions
- ✅ Share with friends easily

#### Option B: Local Development

### Step 1: Get Ably API Key

1. Go to [Ably.com](https://ably.com/) and create a free account
2. Create a new app in the dashboard
3. Copy your API key (looks like: `xxxxxx.xxxxxx:xxxxxxxxxxxxxxxxxxxx`)

### Step 2: Configure the Game

Open `config.js` and replace `YOUR_ABLY_API_KEY_HERE` with your actual Ably API key:

```javascript
ABLY_API_KEY: 'your-actual-api-key-here',
```

### Step 3: Start a Local Server

You need to serve the files over HTTP (not file://) for sensors to work:

**Option A: Using Python**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

**Option B: Using Node.js**
```bash
npx http-server -p 8000
```

**Option C: Using VS Code**
- Install "Live Server" extension
- Right-click on `big-screen.html` and select "Open with Live Server"

### Step 4: Open the Game

1. On your computer/TV, open a browser
2. Go to: `http://localhost:8000/`
3. Click "Big Screen" to display the court

### Step 5: Connect Phones

1. On each phone, open the browser
2. Find your computer's IP address:
   - **Windows**: Open PowerShell and run `ipconfig` (look for IPv4)
   - **Mac/Linux**: Run `ifconfig` or `ip addr` (look for inet)
3. On the phone browser, go to: `http://YOUR-IP-ADDRESS:8000/`
   - Example: `http://192.168.1.100:8000/`
4. Click "Phone Controller" on each phone

### Step 6: Calibrate and Play!

1. **On each phone**:
   - Hold the phone in portrait mode (screen facing your palm)
   - Tap "Start Calibration"
   - Keep the phone still for 3 seconds
   - Start swinging!

2. **How to Play**:
   - Swing your phone like a real badminton racket
   - The shuttlecock appears on the big screen
   - Hit it when it's in your zone (green circle indicator)
   - Swing hard for smashes, gentle for drop shots
   - Rotate your wrist during the swing to add spin

## 🎯 Grip and Safety

### ⚠️ IMPORTANT SAFETY WARNINGS

- **Hold TIGHT!** Use both hands or a wrist strap
- **Clear space**: Make sure there's nothing breakable nearby
- **Watch out**: Don't hit other players, furniture, or pets
- **Phone case**: Use a protective case
- **Stop if dizzy**: Take breaks to avoid motion sickness

### Recommended Grip

```
     📱
     ││  ← Screen facing palm
  ╔══╝╚══╗
  ║  👋  ║  ← Your hand
  ╚══════╝
```

Hold the phone vertically like a racket handle, with the screen facing your palm or outward.

## 🎪 Game Mechanics

### Swing Detection

The game detects three types of swings based on sensor data:

| Swing Type | Speed Threshold | Visual Effect | Haptic Pattern |
|------------|----------------|---------------|----------------|
| **Smash** | > 15 m/s² | Screen shake + fire trail | Double pulse |
| **Normal Hit** | 5-15 m/s² | Standard hit | Single pulse |
| **Drop Shot** | 3-5 m/s² | Gentle arc | Light tap |

### Swing Angles

The gyroscope detects your swing direction:

- **Overhead**: Beta > 45° → Downward smash trajectory
- **Forehand**: Gamma > 30° → Forward swing
- **Backhand**: Gamma < -30° → Reverse swing
- **Underhand**: Beta < -45° → High clear shot

### Wrist Slicing

Rotate your wrist during the swing (change gamma angle) to add spin:
- The shuttlecock will curve in the air
- More rotation = more curve
- Great for deceptive shots!

## 🔧 Advanced Configuration

Edit `config.js` to customize the game:

```javascript
// Adjust swing sensitivity
SMASH_THRESHOLD: 15,        // Lower = easier smashes
MIN_SWING_SPEED: 3,         // Minimum speed to register

// Adjust smoothing
SMOOTHING_FACTOR: 0.7,      // Higher = smoother but less responsive

// Adjust latency compensation
PREDICTION_LOOKAHEAD: 100,  // ms to predict shuttlecock position

// Adjust hit detection
HIT_ZONE_RADIUS: 100,       // Pixels - larger = easier to hit
```

## � Vercel Deployment Guide

### First Time Setup

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Prepare Your Game**:
   - Make sure you've added your Ably API key in `config.js`
   - Test locally first to ensure everything works

3. **Deploy**:
   ```bash
   # Navigate to the game directory
   cd path/to/badminton
   
   # Deploy to Vercel
   vercel
   
   # Follow the prompts:
   # - Set up and deploy? Yes
   # - Which scope? (your account)
   # - Link to existing project? No
   # - Project name? (badminton-game or custom name)
   # - Directory? ./ (current directory)
   # - Override settings? No
   ```

4. **Production Deployment**:
   ```bash
   # For production deployment
   vercel --prod
   ```

### Updating Your Deployment

After making changes, just run:
```bash
vercel --prod
```

### Custom Domain (Optional)

1. In Vercel dashboard, go to your project
2. Click "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

### Environment Variables (Optional)

If you want to keep your Ably API key secret:

1. In `config.js`, change:
   ```javascript
   ABLY_API_KEY: process.env.ABLY_API_KEY || 'YOUR_ABLY_API_KEY_HERE',
   ```

2. In Vercel dashboard:
   - Go to Settings → Environment Variables
   - Add `ABLY_API_KEY` with your key
   - Redeploy

## 🐛 Troubleshooting

### Sensors Not Working

**iOS (iPhone/iPad)**:
- Only works in Safari (not Chrome/Firefox)
- **Must use HTTPS** (Vercel provides this automatically!)
- Requires iOS 13+ with permission granted
- Local `http://` only works with `localhost`, not IP addresses

**Android**:
- Works in Chrome, Firefox, Samsung Internet
- Enable "Motion & Orientation" in browser settings
- Some phones require the page to have user interaction first

### Connection Issues

- **"Connection Failed"**: Check your Ably API key
- **"Disconnected"**: Ensure all devices are on same WiFi
- **Phone can't connect**: Use IP address, not "localhost"
- **Firewall**: Allow port 8000 through your firewall

### Gameplay Issues

- **Swing not detected**: Try swinging harder or adjust `MIN_SWING_SPEED`
- **Too sensitive**: Increase `SMOOTHING_FACTOR` or thresholds
- **Lag**: Reduce `PREDICTION_LOOKAHEAD` if you have good WiFi
- **Calibration failed**: Keep phone completely still during calibration

### Getting Your IP Address

**Windows (PowerShell)**:
```powershell
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
```

**Mac/Linux (Terminal)**:
```bash
ifconfig
# Look for "inet" address (not 127.0.0.1)
```

## 🎨 Visual Effects Explained

- **Fire Trail**: Appears on smash shots with speed > 15 m/s²
- **Screen Shake**: Triggered by smashes for dramatic effect
- **Impact Particles**: Spawn at hit location (orange for smash, green for normal)
- **Hit Zone Indicator**: Green circle shows when shuttlecock is in range
- **Shuttlecock Trail**: Shows recent path for better tracking

## 🏆 Scoring System

- Point scored when shuttlecock lands in opponent's court
- Point to opponent if you hit into net or out of bounds
- First to 21 points wins (standard badminton rules)
- Game automatically resets after each point

## 🔬 Technical Details

### Sensor Data Processing

1. **Raw Data Collection**: 50ms update rate from sensors
2. **Low-Pass Filter**: Smooths noise using exponential moving average
3. **Baseline Subtraction**: Removes device-specific offsets from calibration
4. **Magnitude Calculation**: `√(x² + y² + z²)` for total acceleration
5. **Peak Detection**: Identifies swing completion by acceleration spike
6. **Angle Classification**: Determines hit type from gyroscope orientation

### Network Architecture

```
Phone 1 ─┐
         ├─► Ably Cloud ◄─► Big Screen
Phone 2 ─┘     (Real-time)
```

- Phones publish sensor data on "swing" event
- Big screen subscribes to all swing events
- Haptic feedback sent back via "haptic" event
- Typical latency: 50-100ms with WiFi

### Physics Engine

- **Gravity**: 980 px/s² (simulates real gravity)
- **Air Resistance**: 0.98 damping factor per frame
- **Predictive Positioning**: Estimates shuttlecock location 100ms ahead
- **Collision Detection**: Ground, net, and boundary checks
- **Spin Physics**: Horizontal force applied based on wrist rotation

## 🎮 Multiplayer (2v2 Coming Soon!)

The current version supports 1v1 (2 players). For 2v2:

1. Modify `CONFIG.PLAYER_POSITIONS` to include 4 positions
2. Update `GameState.addPlayer()` to handle 4 players
3. Add team assignment logic
4. Players on same side of net are teammates

## 📱 Supported Devices

### ✅ Tested and Working

- iPhone 13/14/15 (iOS 15+) - Safari only
- Samsung Galaxy S20/S21/S22/S23 - Chrome
- Google Pixel 6/7/8 - Chrome
- OnePlus 9/10/11 - Chrome

### ⚠️ Limited Support

- Older iPhones (iOS < 13) - No sensor permission API
- Budget Android phones - Sensors may be low quality
- Tablets - Too large for comfortable swinging

## 🛠️ Development

### File Structure

```
badmindex.html             # Landing page (device selector)
├── config.js              # Shared configuration
├── physics.js             # Game physics and state
├── phone-controller.html  # Mobile controller
├── big-screen.html        # TV display
├── vercel.json            # Vercel deployment config
├── package.json           # Project metadata
├── .gitignore             # Git ignore rulestroller
├── big-screen.html        # TV display
└── README.md              # This file
```

### Adding Features

**New Swing Types**:
1. Add threshold to `config.js`
2. Update detection in `PhoneController.detectSwing()`
3. Add visual effect in `BadmintonGame.handleSwing()`

**Custom Physics**:
- Edit `ShuttlecockPhysics.launch()` for different trajectories
- Modify `ShuttlecockPhysics.update()` for air resistance/gravity

## 📝 License

This project is open source. Feel free to modify and share!

## 🙏 Credits

- Real-time messaging: [Ably](https://ably.com/)
- Inspired by actual badminton physics
- Built with vanilla JavaScript (no frameworks!)

## 🎉 Have Fun!

Enjoy your phone-powered badminton game! Remember to hold tight and swing responsibly! 🏸

---

**Need Help?** Check the troubleshooting section or open an issue with your device model and browser version.
