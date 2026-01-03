# 🔐 Environment Variables Setup

## For Local Development

1. **Create env.js file**:
   ```bash
   cp env.example.js env.js
   ```

2. **Add your API key** in `env.js`:
   ```javascript
   const ENV = {
     ABLY_API_KEY: 'Dldl3Q.PfNRqg:2Pa66JnCL0WL0TVUB21QQXYL6jtAEn2sn3KD1A4MuS4'
   };
   ```

3. **env.js is git-ignored** - Your API key won't be committed!

## For Vercel Deployment

### Option 1: Using Vercel UI (Recommended)

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add variable:
   - **Name**: `ABLY_API_KEY`
   - **Value**: `Dldl3Q.PfNRqg:2Pa66JnCL0WL0TVUB21QQXYL6jtAEn2sn3KD1A4MuS4`
   - **Environments**: Production, Preview, Development (select all)
4. Click **Save**
5. Redeploy your project

### Option 2: Using Vercel CLI

```bash
# Add environment variable
vercel env add ABLY_API_KEY

# When prompted, paste your API key
# Select: Production, Preview, Development

# Deploy
vercel --prod
```

### Option 3: Create vercel.json with env

Create or update `vercel.json`:

```json
{
  "env": {
    "ABLY_API_KEY": "Dldl3Q.PfNRqg:2Pa66JnCL0WL0TVUB21QQXYL6jtAEn2sn3KD1A4MuS4"
  }
}
```

**⚠️ Warning**: This method exposes the key in your repository. Only use if repo is private!

## How It Works

1. **env.js** loads first and sets `window.ENV`
2. **config.js** reads from `ENV.ABLY_API_KEY`
3. If `env.js` is missing, it falls back to placeholder

## File Structure

```
badminton/
├── env.js              # Your actual API key (git-ignored)
├── env.example.js      # Template (committed to git)
├── config.js           # Reads from ENV
└── ...
```

## For Team Members

Share this with your team:

1. Clone the repository
2. Copy `env.example.js` to `env.js`
3. Add your own Ably API key
4. Start development!
