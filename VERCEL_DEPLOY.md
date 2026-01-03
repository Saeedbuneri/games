# Vercel Deployment Instructions

## Quick Deploy

```bash
vercel --prod
```

## If You Get React/Next.js Errors

Vercel is a static HTML site, not a React app. Use these settings:

### Option 1: Via Vercel CLI

```bash
# Remove any existing deployment
vercel rm badminton-racket-game --yes

# Deploy as static site
vercel --prod
```

### Option 2: Via Vercel Dashboard

1. Go to your project settings
2. **General** → **Build & Development Settings**
3. **Framework Preset**: Select **"Other"** or **"Static HTML"**
4. **Build Command**: Leave blank or set to: (empty)
5. **Output Directory**: Set to `.` (current directory)
6. **Install Command**: Leave blank or set to: (empty)
7. Click **Save**
8. Redeploy

### Option 3: Create .vercelignore

If errors persist, create `.vercelignore`:

```
node_modules/
.git/
*.md
test.html
env.example.js
```

## Environment Variables

Don't forget to add your Ably API key:

1. Project Settings → Environment Variables
2. Add: `ABLY_API_KEY` = `Dldl3Q.PfNRqg:2Pa66JnCL0WL0TVUB21QQXYL6jtAEn2sn3KD1A4MuS4`
3. Select all environments (Production, Preview, Development)

## Verify Deployment

After deployment, test:
- Main page: `https://your-domain.vercel.app/start.html`
- Host screen: `https://your-domain.vercel.app/host-screen.html`
- Controller: `https://your-domain.vercel.app/controller.html`

## Common Issues

**React Error #418**: Vercel thinks it's a Next.js app
- Solution: Change Framework Preset to "Other" in settings

**404 Errors**: Files not found
- Solution: Make sure `outputDirectory` is `.` in vercel.json

**Sensor Not Working**: HTTPS required
- Solution: Use the Vercel domain (has HTTPS), not custom HTTP
