# Umami Analytics Setup Guide

## Overview

This guide will help you set up Umami Analytics for the Sick Of It website to track both page views and custom game events from the Unity WebGL build.

## Architecture

- **Umami**: Self-hosted analytics platform running in Docker
- **PostgreSQL**: Database for storing analytics data
- **Nginx**: Proxies requests from the website to Umami
- **Unity WebGL**: Sends game events via JavaScript interop

## Prerequisites

- Docker and Docker Compose installed
- Access to your server (for production deployment)

## Setup Steps

### 1. Development Setup (Localhost)

1. **Start the development environment:**
   ```powershell
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **Access Umami Dashboard:**
   - Open http://localhost:3000
   - Default credentials:
     - Username: `admin`
     - Password: `umami`

3. **Change default password:**
   - Log in and immediately go to Settings → Profile
   - Change the password to something secure

4. **Create a website entry:**
   - Go to Settings → Websites
   - Click "Add website"
   - Name: `Sick Of It`
   - Domain: `localhost` (for dev) or your production domain
   - Click "Save"
   - Copy the **Website ID** (looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

5. **Update HTML files with Website ID:**
   
   Replace `YOUR_WEBSITE_ID` in these files:
   - `index.html`
   - `blog/index.html`
   - `blog/development.html`
   - `blog/lore.html`
   - `blog/music.html`
   - `blog/posts/yooba.html`
   - `blog/lore/characters/yooba.html`

   Find this line:
   ```html
   <script async defer src="/umami/script.js" data-website-id="YOUR_WEBSITE_ID"></script>
   ```
   
   Replace with:
   ```html
   <script async defer src="/umami/script.js" data-website-id="a1b2c3d4-e5f6-7890-abcd-ef1234567890"></script>
   ```

6. **Update development dashboard with Website ID:**
   
   Edit `blog/development.html` and replace:
   ```javascript
   const WEBSITE_ID = 'YOUR_WEBSITE_ID';
   ```
   
   With your actual website ID:
   ```javascript
   const WEBSITE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
   ```

7. **Generate API Token (Optional - for dashboard):**
   
   The dashboard can work without authentication for public stats, but for more reliable access:
   - Go to Settings → Profile → Generate API Key
   - Copy the token
   - Update in `blog/development.html`:
     ```javascript
     const AUTH_TOKEN = 'your_generated_token_here';
     ```

### 2. Production Setup (Server)

1. **Set environment variables for production:**
   
   Create a `.env` file on the server in the project directory:
   ```bash
   UMAMI_DB_PASSWORD=your_secure_database_password_here
   UMAMI_APP_SECRET=your_random_32_character_secret_key_here
   ```
   
   Generate a secure secret:
   ```powershell
   # PowerShell
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
   ```

2. **Update production URLs:**
   
   In production, you may want to use your actual domain. Update the Umami tracking script URLs if needed, though the current setup using `/umami/script.js` will work via nginx proxy.

3. **Deploy to server:**
   ```bash
   # On your server
   docker-compose -f docker-compose.deploy.yml up -d
   ```

4. **Access Umami Dashboard:**
   - Open http://your-server-ip:3000
   - Login with default credentials and change password
   - Create website entry as described in development setup
   - Update Website ID in all HTML files

5. **Rebuild and deploy website:**
   ```bash
   # Build new image with updated Website IDs
   docker-compose -f docker-compose.prod.yml build
   docker push jgriffith3433/sickofitgame:latest
   
   # On server, pull and restart
   docker-compose -f docker-compose.deploy.yml pull web
   docker-compose -f docker-compose.deploy.yml up -d
   ```

### 3. Configure Nginx Reverse Proxy (Production - Optional)

If you want to access Umami dashboard via your main domain (e.g., analytics.yourdomain.com), set up a reverse proxy with SSL:

```nginx
server {
    listen 443 ssl;
    server_name analytics.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Testing

### Test Page View Tracking

1. Open your website: http://localhost
2. Navigate to different pages
3. Go to Umami Dashboard → Realtime
4. You should see your page views appearing in real-time

### Test Custom Events

Once Unity integration is complete, test game events:

1. Play the game
2. In Umami Dashboard → Events
3. You should see:
   - `game_start` - When game initializes
   - `level1_complete` - When level 1 is completed
   - Other custom events as implemented

### Test Analytics Dashboard

1. Navigate to: http://localhost/blog/development.html
2. You should see:
   - Total Page Views
   - Unique Visitors
   - Total Plays (game_start events)
   - Level 1 Completions

Note: Dashboard requires some data to be collected first. Run the website and game for a few minutes to generate sample data.

## Troubleshooting

### Umami not loading
- Check Docker containers are running: `docker ps`
- Check logs: `docker logs umami-dev` (or `umami` in production)
- Verify nginx proxy is working: http://localhost/umami/ should redirect to Umami

### Events not tracking
- Open browser console (F12) and look for Umami-related errors
- Verify the Umami script is loaded: Check Network tab for `/umami/script.js`
- Verify Website ID is correct in HTML files
- Check that `umami` object is available: Type `umami` in browser console

### Dashboard showing N/A
- Verify Website ID is updated in `blog/development.html`
- Check browser console for API errors
- Verify Umami API is accessible: http://localhost/umami/api
- Wait a few minutes for data to be collected

### Database issues
- Check PostgreSQL logs: `docker logs umami-postgres-dev`
- Verify database credentials match in docker-compose files
- Try restarting containers: `docker-compose -f docker-compose.dev.yml restart`

## Adding More Events

To track additional game events:

1. **Add JavaScript function in `umami-game-events.js`:**
   ```javascript
   function trackBossDefeated(bossName) {
     umamiTrack('boss_defeated', { boss: bossName });
   }
   window.trackBossDefeated = trackBossDefeated;
   ```

2. **Call from Unity C# (see Unity integration guide)**

3. **View in dashboard:**
   - Events automatically appear in Umami Dashboard → Events
   - Add to development.html dashboard if you want to display specific counts

## Data Privacy

Umami is privacy-focused:
- No cookies used
- Visitor data is anonymized
- GDPR compliant
- Self-hosted (you own the data)
- No personal information collected

## Backup and Maintenance

### Backup PostgreSQL Database

```bash
docker exec umami-postgres pg_dump -U umami umami > umami_backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
docker exec -i umami-postgres psql -U umami umami < umami_backup_20260216.sql
```

## Resources

- [Umami Documentation](https://umami.is/docs)
- [Umami GitHub](https://github.com/umami-software/umami)
- [Umami API Reference](https://umami.is/docs/api)
