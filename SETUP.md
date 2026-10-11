# Sick Of It - Complete Setup Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Initial Setup](#initial-setup)
5. [File Structure](#file-structure)
6. [Component Details](#component-details)
7. [Deployment Workflow](#deployment-workflow)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## Project Overview

This project deploys a **Unity 6 WebGL game** using a production-ready Docker workflow with:
- Local development environment with hot-reload
- Docker Hub-based deployment pipeline
- AWS EC2 production server hosting
- Full mobile support (iOS/Android)
- Automated batch scripts for all operations

### Key Technologies
- **Unity 6 WebGL**: Game engine build output
- **nginx:alpine**: Lightweight web server
- **Docker & Docker Compose**: Containerization and orchestration
- **Docker Hub**: Private image registry (jgriffith3433/sickofitgame)
- **AWS EC2**: Production hosting (Ubuntu 24.04 LTS)

---

## Architecture

### Three-Environment Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                      DEVELOPMENT                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-compose.dev.yml                              │  │
│  │  - Volume mounts (Game/, index.html, nginx.conf)    │  │
│  │  - Live reload on file changes                       │  │
│  │  - Port: localhost:80                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      PRODUCTION BUILD                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-compose.prod.yml                             │  │
│  │  - Builds production target                          │  │
│  │  - Bakes Game/ files into image                      │  │
│  │  - Pushes to Docker Hub                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  docker-compose.deploy.yml                           │  │
│  │  - Pulls from Docker Hub                             │  │
│  │  - Runs on EC2 server                                │  │
│  │  - Auto-restart enabled                              │  │
│  │  - Port: ec2-13-220-32-55.compute-1.amazonaws.com:80│  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

1. **Separation of Concerns**: Development uses volume mounts for fast iteration, production uses immutable images
2. **Docker Hub Registry**: Decouples build process from deployment server
3. **Multi-stage Dockerfile**: Single Dockerfile supports both dev and prod targets
4. **Automated Scripts**: Windows batch files simplify complex Docker commands

---

## Prerequisites

### Local Machine (Windows)
- Docker Desktop installed and running
- Docker Hub account (jgriffith3433/sickofitgame)
- Git (optional)
- OpenSSH client (built into Windows 10/11)

### EC2 Server
- Ubuntu 24.04 LTS
- Docker and Docker Compose v2 installed
- SSH access configured
- Security group allowing port 80 (HTTP)
- SSH key: `sickofitgame-server.pem`

---

## Initial Setup

### 1. Unity WebGL Build Structure

The project started with Unity 6 WebGL build output in the `Game/` folder:

```
Game/
├── Build/
│   ├── Builds.data           # Game data
│   ├── Builds.framework.js   # Unity framework
│   ├── Builds.loader.js      # Unity loader
│   └── Builds.wasm           # WebAssembly binary
├── TemplateData/
│   ├── favicon.ico
│   ├── unity-logo-dark.png
│   └── (other assets)
└── index.html                # Unity's default (not used)
```

### 2. Why We Created Custom index.html

**Problem**: Unity's default index.html has limitations:
- Not optimized for full-screen web deployment
- No mobile touch/viewport handling
- No pointer lock error handling
- Basic UI without loading states

**Solution**: Created custom `index.html` at project root with:
- Full-screen canvas that fills viewport
- Mobile support (iOS/Android touch events, visualViewport API)
- Click-to-start overlay (required for pointer lock user gesture)
- Pointer lock re-acquisition on tab switching
- iOS Safari compatibility (skips unsupported fullscreen API)
- Loading progress bar with styling
- Touch event prevention for mobile (no pull-to-refresh, no bounce)

### 3. nginx Configuration

**Why nginx?**
- Lightweight static file server
- Built-in gzip compression
- HTTP header control
- MIME type configuration

**Critical Configuration**:
```nginx
# Unity WebGL requires specific MIME types
include /etc/nginx/mime.types;    # This was critical!
default_type application/octet-stream;

types {
    application/wasm wasm;         # WebAssembly
    application/javascript js;
}

# Compression for faster loading
gzip on;
gzip_types text/css application/javascript application/wasm;

# Immutable cache headers for build files
location ~* \.(data|wasm|framework\.js|loader\.js)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

**Troubleshooting Notes**:
- Initial error: `Uncaught SyntaxError: Unexpected token <` because .wasm files served as text/html
- Fix: Added `include /etc/nginx/mime.types;` at server level (not just in types block)

### 4. Multi-stage Dockerfile

**Why Multi-stage?**
- Single Dockerfile for both development and production
- Reduces image size (base layer shared)
- Clear separation between targets

**Structure**:
```dockerfile
# Base: Common nginx configuration
FROM nginx:alpine AS base
  - Remove default nginx config
  - Copy custom nginx.conf
  - Setup healthcheck

# Development: Expects volume mounts
FROM base AS development
  - No file copying (uses volumes)
  - CMD to start nginx

# Production: Bakes in files
FROM base AS production
  - COPY Game/ (includes Build/ and TemplateData/)
  - COPY index.html
  - CMD to start nginx
```

**Initial Mistake**: Tried to copy `TemplateData/` separately from project root
**Fix**: It's inside `Game/`, so only `COPY Game/` is needed

### 5. Docker Compose Files

#### docker-compose.dev.yml
**Purpose**: Local development with live reload

```yaml
services:
  web:
    build:
      target: development    # Uses development stage
    volumes:
      - ./Game:/usr/share/nginx/html/Game:ro          # Unity files
      - ./index.html:/usr/share/nginx/html/index.html:ro  # Custom wrapper
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro    # nginx config
    ports:
      - "80:80"
```

**Why Volume Mounts?**
- Changes to Game files, index.html, or nginx.conf reflect immediately
- No rebuild needed for content updates
- Fast iteration during development

#### docker-compose.prod.yml
**Purpose**: Build and push production image

```yaml
services:
  web:
    build:
      target: production     # Uses production stage
    image: jgriffith3433/sickofitgame:latest
    push: true              # Automatically push to Docker Hub
```

**Why Separate File?**
- Clear intent: this is for building production images
- No accidental volume mounts
- Explicit push configuration

#### docker-compose.deploy.yml
**Purpose**: Deploy on production server

```yaml
services:
  web:
    image: jgriffith3433/sickofitgame:latest
    pull_policy: always     # Always pull latest
    restart: unless-stopped # Auto-restart on crashes
    ports:
      - "80:80"
```

**Why Third File?**
- Copied to EC2 server
- No build context needed on server
- Only pulls pre-built images from Docker Hub
- Server doesn't need access to source code

### 6. Docker Ignore Files

**.dockerignore**:
```
*.pem                # SSH keys - SECURITY
*.bat                # Windows batch scripts
docker-compose.*.yml # Don't need compose files in image
.git                 # Source control
README.md            # Documentation
SETUP.md
```

**Why?**
- Prevents SSH keys from being baked into images
- Reduces image size
- Security best practice

**.gitignore**:
```
*.pem                # SSH keys - NEVER commit
```

---

## File Structure

### Complete Project Layout

```
c:\Projects\SickOfIt\
│
├── Game/                                    # Unity WebGL build output
│   ├── Build/
│   │   ├── Builds.data                     # 64MB game data
│   │   ├── Builds.framework.js             # Unity framework
│   │   ├── Builds.loader.js                # Unity loader
│   │   └── Builds.wasm                     # WebAssembly binary
│   ├── TemplateData/                       # Unity assets (logos, icons)
│   └── index.html                          # Unity's default (unused)
│
├── index.html                               # Custom full-screen wrapper
├── nginx.conf                               # Custom nginx configuration
├── Dockerfile                               # Multi-stage Docker build
│
├── docker-compose.dev.yml                   # Local development
├── docker-compose.prod.yml                  # Build and push
├── docker-compose.deploy.yml                # Server deployment
│
├── .dockerignore                            # Docker build exclusions
├── .gitignore                               # Git exclusions
│
├── sickofitgame-server.pem                  # SSH private key (NEVER commit)
│
├── auto-start.bat                           # Start dev environment
├── auto-stop.bat                            # Stop dev environment
├── auto-prod.bat                            # Full build→push→deploy
├── auto-deploy.bat                          # Quick pull and restart
├── auto-copy-deploy.bat                     # Copy deploy file to server
├── auto-ssh.bat                             # SSH into EC2
├── auto-check-status.bat                    # Check server status
├── auto-logs-dev.bat                        # Follow local logs
├── auto-logs-prod.bat                       # Follow server logs
│
├── README.md                                # User guide
└── SETUP.md                                 # This file
```

---

## Component Details

### index.html (Custom Wrapper)

**Key Features**:

1. **Mobile Viewport Setup**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, 
      maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
```
**Why?** Forces full-screen on mobile, prevents zoom, covers notch areas on iOS

2. **Overscroll Prevention**:
```css
html, body {
  overflow: hidden;
  overscroll-behavior: none;
  touch-action: none;
}
```
**Why?** Prevents pull-to-refresh and bounce effects on mobile

3. **Click-to-Start Overlay**:
```javascript
function startGame() {
  document.getElementById('start-overlay').style.display = 'none';
  loadUnityGame();
}
```
**Why?** Pointer Lock API requires user gesture; can't auto-lock on page load

4. **iOS Fullscreen Handling**:
```javascript
if (isIOS) {
  console.log('iOS detected - skipping fullscreen request');
  return;
}
```
**Why?** iOS Safari doesn't fully support Fullscreen API; attempting causes errors

5. **Pointer Lock Re-acquisition**:
```javascript
document.addEventListener('pointerlockchange', function() {
  if (document.pointerLockElement !== canvasElement) {
    needsPointerLockReacquire = true;
  }
});
```
**Why?** Tabbing out loses pointer lock; need to re-acquire on next click

6. **visualViewport API** (Mobile):
```javascript
if (window.visualViewport) {
  width = window.visualViewport.width;
  height = window.visualViewport.height;
}
```
**Why?** Handles mobile keyboard appearance and orientation changes correctly

### nginx.conf

**Key Sections**:

1. **MIME Types**:
```nginx
include /etc/nginx/mime.types;
default_type application/octet-stream;
```
**Critical**: Without this, .wasm files served as text/html causing errors

2. **Enable Compression**:
```nginx
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_types text/css application/javascript application/wasm;
```
**Why?** Reduces transfer size by ~70% for faster loading

3. **Cache Headers**:
```nginx
location ~* \.(data|wasm|framework\.js|loader\.js)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```
**Why?** Build files never change; can cache indefinitely (immutable)

4. **CORS Headers**:
```nginx
add_header Access-Control-Allow-Origin *;
```
**Why?** Allows loading from different origins if needed

5. **Security Headers**:
```nginx
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options SAMEORIGIN;
```
**Why?** Basic security hardening

### Dockerfile

**Three-Stage Design**:

```dockerfile
# Stage 1: Base (Shared)
FROM nginx:alpine AS base
- nginx:alpine chosen for 6MB size vs 140MB for nginx:latest
- Remove default config
- Copy custom nginx.conf
- Setup healthcheck

# Stage 2: Development
FROM base AS development
- No file copies (expects volumes)
- Used by docker-compose.dev.yml

# Stage 3: Production
FROM base AS production
- COPY Game/ (includes all Unity files)
- COPY index.html (custom wrapper)
- Used by docker-compose.prod.yml
```

**Why Alpine?**
- Base image: 6MB vs 140MB
- Faster deployments
- Smaller attack surface

**Why Multi-stage?**
- Development doesn't need file copying (uses volumes)
- Production bakes files in (immutable deployments)
- Single source of truth for both environments

---

## Deployment Workflow

### Development Workflow

```bash
# Start local development server
auto-start.bat

# Visit: http://localhost
# Edit files in Game/, index.html, or nginx.conf
# Refresh browser to see changes (no rebuild needed)

# Follow logs
auto-logs-dev.bat

# Stop server
auto-stop.bat
```

**Volume Mounts Enable**:
- Instant reflection of index.html changes
- Game file updates without rebuild
- nginx.conf tuning in real-time

### Production Deployment Workflow

#### Full Pipeline (auto-prod.bat)

```bash
Step 1: Build production image
  docker-compose -f docker-compose.prod.yml build

Step 2: Push to Docker Hub
  docker-compose -f docker-compose.prod.yml push

Step 3: Copy deployment file to server
  scp docker-compose.deploy.yml ubuntu@ec2:~/sickofitgame/

Step 4: Deploy on server
  ssh ubuntu@ec2 "cd ~/sickofitgame && docker compose pull && docker compose up -d"
```

**Why This Flow?**
1. Build locally (has source code)
2. Push to Docker Hub (registry)
3. Server pulls from registry (no source code needed)
4. Server runs pre-built image (fast deployment)

#### Quick Deploy (auto-deploy.bat)

```bash
# When image already built and pushed
# Just pull and restart on server
ssh ubuntu@ec2 "cd ~/sickofitgame && docker compose pull && docker compose up -d"
```

**Use Case**: When you've already run auto-prod.bat and just need to restart server

### Batch File Breakdown

| Script | Purpose | Use Case |
|--------|---------|----------|
| `auto-start.bat` | Start dev environment | Local development |
| `auto-stop.bat` | Stop dev environment | Stop local server |
| `auto-logs-dev.bat` | Follow local logs | Debug local issues |
| `auto-prod.bat` | Full build→push→deploy | New game version |
| `auto-deploy.bat` | Quick redeploy | Restart server |
| `auto-copy-deploy.bat` | Copy deploy config | Update deploy settings |
| `auto-ssh.bat` | SSH into server | Manual server access |
| `auto-check-status.bat` | Check server status | Verify deployment |
| `auto-logs-prod.bat` | Follow server logs | Debug production issues |

---

## Troubleshooting

### Issue 1: "Unexpected token <" in .wasm file

**Symptom**: Console error when loading game
```
Uncaught SyntaxError: Unexpected token '<'
Failed to load Builds.wasm
```

**Cause**: nginx serving .wasm files as `text/html` instead of `application/wasm`

**Solution**: Add to nginx.conf at server level (not just types block):
```nginx
include /etc/nginx/mime.types;
default_type application/octet-stream;

types {
    application/wasm wasm;
    application/javascript js;
}
```

### Issue 2: index.html Downloads Instead of Serving

**Symptom**: Browser prompts to download index.html instead of displaying it

**Cause**: Missing MIME types configuration

**Solution**: Same as Issue 1 - ensure `include /etc/nginx/mime.types;` is present

### Issue 3: Pointer Lock Errors on Tab Switch

**Symptom**: Console errors when switching tabs:
```
NotAllowedError: The Pointer Lock request is denied.
```

**Cause**: Pointer lock automatically releases on tab switch

**Solution**: Handle re-acquisition in index.html:
```javascript
document.addEventListener('pointerlockchange', function() {
  if (document.pointerLockElement !== canvasElement) {
    needsPointerLockReacquire = true;
  }
});

// Suppress the error
window.addEventListener('unhandledrejection', function(event) {
  if (event.reason && event.reason.name === 'NotAllowedError' && 
      event.reason.message && event.reason.message.includes('Pointer Lock')) {
    event.preventDefault();
  }
});
```

### Issue 4: Mobile Pull-to-Refresh Interfering

**Symptom**: On mobile, pulling canvas triggers page refresh

**Cause**: Default mobile browser behavior

**Solution**: Prevent touch events in index.html:
```javascript
document.addEventListener('touchmove', function(e) {
  if (e.target === canvas || e.target === container) {
    e.preventDefault();
  }
}, { passive: false });
```

```css
body {
  overscroll-behavior: none;
  touch-action: none;
}
```

### Issue 5: iOS Fullscreen Errors

**Symptom**: iOS Safari throws fullscreen errors

**Cause**: iOS doesn't fully support Fullscreen API

**Solution**: Detect iOS and skip fullscreen request:
```javascript
if (isIOS) {
  console.log('iOS detected - skipping fullscreen request');
  return;
}
```

### Issue 6: Docker Build "TemplateData not found"

**Symptom**: 
```
COPY TemplateData/ /usr/share/nginx/html/TemplateData/
ERROR: "/TemplateData": not found
```

**Cause**: TemplateData/ is inside Game/, not at project root

**Solution**: Remove redundant COPY line from Dockerfile:
```dockerfile
# Before (WRONG)
COPY Game/ /usr/share/nginx/html/Game/
COPY TemplateData/ /usr/share/nginx/html/TemplateData/  # DOESN'T EXIST AT ROOT

# After (CORRECT)
COPY Game/ /usr/share/nginx/html/Game/  # This includes TemplateData/
```

### Issue 7: docker-compose vs docker compose

**Symptom**: 
```bash
bash: docker-compose: command not found
```

**Cause**: EC2 server has Docker Compose v2 (uses `docker compose` not `docker-compose`)

**Solution**: Use `docker compose` (space) in SSH commands:
```bash
# Old (v1): docker-compose -f file.yml up
# New (v2): docker compose -f file.yml up
```

### Issue 8: Can't Push to Docker Hub

**Symptom**: 
```
denied: requested access to the resource is denied
```

**Cause**: Not logged into Docker Hub locally

**Solution**:
```bash
docker login
# Enter credentials for jgriffith3433
```

### Issue 9: Server Can't Pull Image

**Symptom**:
```
docker.io/jgriffith3433/sickofitgame:latest: not found
```

**Cause**: Image not pushed to Docker Hub, or server not logged in

**Solution**:
1. Locally: Verify build succeeded and push completed
2. On server: `docker login` if repository is private

---

## Maintenance

### Updating Game Content

```bash
# 1. Replace Unity build files in Game/
# 2. Test locally
auto-start.bat
# Visit http://localhost

# 3. If looks good, stop local
auto-stop.bat

# 4. Deploy to production
auto-prod.bat
```

### Updating index.html Styling

```bash
# 1. Edit index.html
# 2. Test locally (changes reflect immediately due to volumes)
auto-start.bat

# 3. Deploy
auto-prod.bat
```

### Updating nginx Configuration

```bash
# 1. Edit nginx.conf
# 2. Restart dev container to test
auto-stop.bat
auto-start.bat

# 3. If working, deploy
auto-prod.bat
```

### Checking Server Status

```bash
# Quick status check
auto-check-status.bat

# Manual check
auto-ssh.bat
docker ps                    # See running containers
docker compose logs -f       # Follow logs
```

### Monitoring Logs

```bash
# Local logs
auto-logs-dev.bat

# Production logs
auto-logs-prod.bat
```

### Rolling Back

```bash
# 1. SSH into server
auto-ssh.bat

# 2. Find previous image tag
docker images | grep sickofitgame

# 3. Edit docker-compose.deploy.yml
nano ~/sickofitgame/docker-compose.deploy.yml
# Change image: jgriffith3433/sickofitgame:latest
# To:    image: jgriffith3433/sickofitgame:<previous-tag>

# 4. Restart
cd ~/sickofitgame
docker compose down
docker compose up -d
```

**Note**: We use `:latest` tag. For true rollback capability, tag builds with versions:
```yaml
image: jgriffith3433/sickofitgame:v1.0.0
```

---

## Security Considerations

### 1. SSH Key Management

**Current Setup**:
- Private key: `sickofitgame-server.pem` (local only)
- Excluded from Git: `.gitignore`
- Excluded from Docker: `.dockerignore`

**Best Practices**:
- Never commit .pem files
- Keep permissions: `chmod 400` (on Linux/Mac)
- Rotate keys periodically
- Use key passphrase

### 2. Docker Hub Credentials

**Current Setup**:
- Private repository: `jgriffith3433/sickofitgame`
- Requires `docker login`

**Best Practices**:
- Use access tokens instead of password
- Limit token scope to push/pull only
- Rotate tokens periodically

### 3. EC2 Security Group

**Required Rules**:
```
Inbound:
  - Port 80 (HTTP): 0.0.0.0/0  # Public access to game
  - Port 22 (SSH): YOUR_IP/32   # Restricted SSH access

Outbound:
  - All traffic: 0.0.0.0/0      # For Docker Hub access
```

### 4. nginx Security Headers

Already configured in nginx.conf:
```nginx
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options SAMEORIGIN;
add_header X-XSS-Protection "1; mode=block";
```

### 5. Future: HTTPS

**Current**: HTTP only (port 80)

**Recommended for Production**:
- Use Let's Encrypt SSL certificate
- Nginx HTTPS configuration
- Redirect HTTP to HTTPS
- Security group: Add port 443

---

## Performance Optimizations

### 1. Gzip Compression

Enabled in nginx.conf:
```nginx
gzip on;
gzip_comp_level 6;
gzip_types text/css application/javascript application/wasm;
```

**Impact**: ~70% reduction in transfer size

### 2. Cache Headers

Immutable cache for build files:
```nginx
location ~* \.(data|wasm|framework\.js|loader\.js)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

**Impact**: Subsequent loads use browser cache (instant)

### 3. Alpine Base Image

Using `nginx:alpine` (6MB) vs `nginx:latest` (140MB)

**Impact**: 
- Faster Docker image pulls
- Lower bandwidth costs
- Smaller disk usage

### 4. Docker Layer Caching

Dockerfile ordered for optimal caching:
```dockerfile
# Changes rarely
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Changes frequently
COPY Game/ /usr/share/nginx/html/Game/
COPY index.html /usr/share/nginx/html/index.html
```

**Impact**: Rebuilds only changed layers

---

## Future Improvements

### 1. Automated CI/CD

**Current**: Manual `auto-prod.bat` execution

**Future**: GitHub Actions workflow:
```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    - Build Docker image
    - Push to Docker Hub
    - SSH to EC2 and deploy
```

### 2. HTTPS with SSL

Add Let's Encrypt certificate:
```bash
# Install certbot on EC2
sudo certbot --nginx -d yourdomain.com
```

### 3. Custom Domain

**Current**: `ec2-13-220-32-55.compute-1.amazonaws.com`

**Future**: `sickofitgame.com`
- Register domain
- Point A record to EC2 IP
- Update nginx server_name

### 4. Multi-Region Deployment

Deploy to multiple regions:
- US East (current)
- EU West
- Asia Pacific

GeoDNS routing for lowest latency

### 5. Monitoring & Alerts

**Potential Tools**:
- Prometheus + Grafana for metrics
- CloudWatch for EC2 monitoring
- UptimeRobot for availability checks

### 6. CDN for Static Assets

Serve `TemplateData/` and `Build/` from CloudFront CDN:
- Faster global delivery
- Reduced EC2 bandwidth costs
- Better DDoS protection

### 7. Automatic Backups

Backup game versions:
- Tag Docker images with version numbers
- S3 bucket for Game/ file backups
- Automated weekly snapshots

### 8. Load Balancing

For high traffic:
- Multiple EC2 instances
- Application Load Balancer
- Auto-scaling group

---

## Quick Reference

### Local Development
```bash
auto-start.bat          # Start
http://localhost        # Visit
auto-logs-dev.bat       # View logs
auto-stop.bat           # Stop
```

### Production Deployment
```bash
auto-prod.bat           # Full pipeline (build→push→deploy)
auto-deploy.bat         # Quick restart
auto-ssh.bat            # Manual access
auto-check-status.bat   # Verify deployment
auto-logs-prod.bat      # View production logs
```

### Server Access
```bash
auto-ssh.bat
# Then on server:
cd ~/sickofitgame
docker compose ps       # List containers
docker compose logs -f  # Follow logs
docker compose restart  # Restart
docker compose down     # Stop
```

### URLs
- **Local**: http://localhost
- **Production**: http://ec2-13-220-32-55.compute-1.amazonaws.com
- **Docker Hub**: https://hub.docker.com/r/jgriffith3433/sickofitgame

---

## Final Notes

This setup provides a complete, production-ready deployment pipeline for Unity WebGL games with:
- ✅ Local development with hot-reload
- ✅ Docker-based deployment
- ✅ Private Docker Hub registry
- ✅ AWS EC2 production hosting
- ✅ Full mobile support (iOS/Android)
- ✅ Automated deployment scripts
- ✅ Proper error handling
- ✅ Security best practices

The architecture is scalable and can be extended with HTTPS, custom domains, CDN, monitoring, and multi-region deployment as your game grows.

**Key Success Factors**:
1. Multi-stage Dockerfile (dev vs prod)
2. Three-environment workflow (dev/build/deploy)
3. Docker Hub as registry (decouples build from deployment)
4. Custom index.html (mobile support, fullscreen, pointer lock)
5. Proper nginx configuration (MIME types, compression, caching)
6. Automated batch scripts (simplifies operations)

**Total Cost**:
- EC2 t2.micro: ~$8/month (or free tier)
- Docker Hub: Free for private repositories
- Bandwidth: Pay-as-you-go

---

**Created**: February 7, 2026  
**Unity Version**: 6  
**Docker Compose Version**: v2  
**nginx Version**: alpine (latest)  
**Server**: Ubuntu 24.04 LTS
