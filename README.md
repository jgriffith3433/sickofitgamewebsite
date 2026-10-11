# Sick Of It - Unity WebGL Game Deployment

Production-ready Docker deployment for Unity 6 WebGL game using nginx and Docker Hub.

## ⚡ Quick Reference

**Local Development:**
- `auto-start.bat` - Start dev server with live reload
- `auto-stop.bat` - Stop dev server
- Game at: http://localhost

**Production Deployment:**
- `auto-prod.bat` - Full pipeline: Build → Push to Docker Hub → Deploy to EC2
- `auto-deploy.bat` - Quick deploy: Pull latest image and restart on server
- `auto-copy-deploy.bat` - Copy deployment files to server
- `auto-check-status.bat` - Check production server status and logs
- `auto-ssh.bat` - SSH into production server

**Docker Hub:** `jgriffith3433/sickofitgame:latest` (private)

**Server:** `ec2-13-220-32-55.compute-1.amazonaws.com`

---

## 🚀 Quick Start

### Local Development/Testing

#### Windows (Easy Mode)
Simply double-click the batch files:
- **`auto-start.bat`** - Build and start dev environment (shows logs, with live reload)
- **`auto-stop.bat`** - Stop dev environment
- **`auto-prod.bat`** - Build, push to Docker Hub, and deploy to production
- **`auto-deploy.bat`** - Quick deploy (pull latest image and restart on server)
- **`auto-copy-deploy.bat`** - Copy deployment files to server
- **`auto-ssh.bat`** - SSH into production server

#### Manual Commands (Development)
1. Build and run development environment:
```bash
docker compose -f docker-compose.dev.yml up -d
```

2. Access the game at:
```
http://localhost
```

3. Stop the development environment:
```bash
docker compose -f docker-compose.dev.yml down
```

## 📦 Production Deployment

### Docker Hub Workflow

This project uses a professional Docker Hub workflow:

1. **docker-compose.dev.yml** - Local development with live file mounting
2. **docker-compose.prod.yml** - Builds and pushes to Docker Hub (`jgriffith3433/sickofitgame:latest`)
3. **docker-compose.deploy.yml** - Production deployment (pulls from Docker Hub)

### Full Production Deploy (Build, Push, Deploy)

#### Windows (Recommended)
Double-click **`auto-prod.bat`** which will:
1. Build production Docker image
2. Push to Docker Hub (jgriffith3433/sickofitgame:latest)
3. Copy deployment file to server
4. Pull and deploy on EC2

#### Manual Steps
```bash
# 1. Build and push to Docker Hub
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml push

# 2. Copy deployment file to server
scp -i sickofitgame-server.pem docker-compose.deploy.yml ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com:~/sickofitgame/

# 3. SSH and deploy
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com
cd ~/sickofitgame
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
```

### Quick Deploy (Image Already Pushed)

If you've already pushed to Docker Hub and just want to update the server:

**Windows:** Double-click **`auto-deploy.bat`**

**Manual:**
```bash
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && docker compose -f docker-compose.deploy.yml pull && docker compose -f docker-compose.deploy.yml down && docker compose -f docker-compose.deploy.yml up -d"
```

## 🐳 Docker Hub

**Repository:** `jgriffith3433/sickofitgame` (private)

Make sure you're logged into Docker Hub:
```bash
docker login
```

## 📂 Docker Compose Files

### docker-compose.dev.yml
- For local development
- Mounts files as volumes for instant updates
- No need to rebuild for game changes
- Port 80 exposed to localhost

### docker-compose.prod.yml  
- Builds production image
- Pushes to Docker Hub
- Multi-stage build (production target)
- All files baked into the image

### docker-compose.deploy.yml
- Used on EC2 server
- Pulls from Docker Hub
- Auto-restart enabled
- Production-optimized settings

### Production deployment (pulls from Docker Hub)

1. Copy all files to your server first time:
   ```bash
   scp -i sickofitgame-server.pem -r . ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com:~/sickofitgame
   ```

2. SSH into your server and navigate to the project directory

3. Build and start the container:
```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

4. Verify the container is running:
```bash
docker compose -f docker-compose.deploy.yml ps
docker compose -f docker-compose.deploy.yml logs -f
```

### Manual Docker Commands

1. Build the image:
```bash
docker build -t jgriffith3433/sickofitgame:latest --target production .
```

2. Push to Docker Hub:
```bash
docker push jgriffith3433/sickofitgame:latest
```

3. Run on server:
```bash
docker run -d \
  --name sickofitgame \
  -p 80:80 \
  --restart always \
  jgriffith3433/sickofitgame:latest
```

4. Check container status:
```bash
docker ps
docker logs sickofitgame
```

## 🌐 Domain Configuration

### Using a Domain Name (e.g., sickofitgame.com)

1. Point your domain's DNS A record to your server's IP address

2. **For HTTPS (Highly Recommended):**

   Update `docker-compose.yml` to use port 443 and add SSL certificate mounting:

   ```yaml
   services:
     web:
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./ssl:/etc/nginx/ssl:ro
   ```

   Update `nginx.conf` to add SSL configuration:


   server {
       listen 80;
       server_name sickofitgame.com;
       return 301 https://$server_name$request_uri;
   }
   ```

3. **Using Let's Encrypt (Free SSL):**

   Consider using [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy) with Let's Encrypt companion, or use Certbot to generate certificates.

## 🔧 Configuration

### Nginx Configuration (`nginx.conf`)

The nginx configuration includes:
- ✅ Proper MIME types for Unity WebGL (.wasm, .js, .data)
- ✅ Gzip compression for optimal performance
- ✅ Aggressive caching for build files (immutable, 1 year)
- ✅ No-cache for index.html (ensures updates are served)
- ✅ CORS headers for cross-origin resources
- ✅ Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- ✅ Health check endpoint at `/health`

### Full-Screen Experience

The custom `index.html` provides:
- ✅ Automatic canvas resizing to fill the entire browser window
- ✅ Responsive design for desktop and mobile
- ✅ Fullscreen request on first user interaction
- ✅ Modern, clean loading experience
- ✅ Error handling and user feedback

## 🔍 Monitoring & Maintenance

### Mobile Support

The game is fully optimized for mobile devices:

**iOS Safari:**
- Handles Safari's limited fullscreen API support gracefully
- Prevents scroll bouncing and pull-to-refresh
- Touch-optimized start button
- Visual viewport support for accurate sizing with browser UI

**Android Chrome/Firefox:**
- Full fullscreen support
- Touch controls work seamlessly  
- Orientation change handling
- Prevents unwanted scrolling

**All Mobile Browsers:**
- Touch events properly handled
- No pointer lock errors on mobile
- Responsive canvas sizing
- Optimized for touch gameplay

### Check Container Health (Development)
```bash
docker compose -f docker-compose.dev.yml ps
```

### Check Container Health (Production)
```bash
# Local check
docker compose -f docker-compose.prod.yml ps

# Server check (via SSH)
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "docker ps"
```

### View Logs
```bash
# Development
docker compose -f docker-compose.dev.yml logs -f

# Production (on server)
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "docker logs -f sickofitgame"
```

### Restart Container
```bash
# Development
docker compose -f docker-compose.dev.yml restart

# Production (on server)
ssh -i sickofitgame-server.pem ubuntu@ec2-13-220-32-55.compute-1.amazonaws.com "cd ~/sickofitgame && docker compose -f docker-compose.deploy.yml restart"
```

### Update the Game

**Option 1: Full rebuild and push (if you changed Unity build files)**
1. Replace the `Game/` folder with new Unity build
2. Run `auto-prod.bat` (builds, pushes, deploys)

**Option 2: Quick update (if image is already pushed)**
1. Run `auto-deploy.bat` (pulls and restarts on server)

## 🛡️ Security Considerations

### Production Checklist:
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Configure firewall rules (allow only ports 80, 443, and SSH)
- [ ] Set up regular automated backups
- [ ] Configure log rotation
- [ ] Keep Docker and base images updated
- [ ] Consider adding rate limiting for DDoS protection
- [ ] Set up monitoring (e.g., UptimeRobot, Datadog)

### Firewall Configuration (Ubuntu/Debian)
```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

## 📊 Resource Usage

Typical resource requirements:
- **CPU**: Minimal (nginx is very efficient)
- **RAM**: 50-100MB for nginx + container overhead
- **Disk**: Size of Game folder + ~50MB for nginx image
- **Network**: Depends on game size and number of concurrent players

## 🐛 Troubleshooting

### Game doesn't load
1. Check container logs: `docker-compose logs`
2. Verify all build files are present in `Game/SickOfIt/`
3. Check browser console for JavaScript errors
4. Ensure proper MIME types are served (check Network tab in DevTools)

### Container won't start
1. Check port 80 is not already in use: `netstat -tuln | grep :80`
2. Verify Docker is running: `docker ps`
3. Check for syntax errors: `docker-compose config`

### Can't access from domain
1. Verify DNS propagation: `nslookup sickofitgame.com`
2. Check server firewall allows port 80/443
3. Verify nginx is listening: `docker exec sickofitgame netstat -tuln`

### Performance issues
1. Enable gzip/brotli compression in Unity build settings
2. Optimize Unity build size (code stripping, compression)
3. Use CDN for static assets if global audience
4. Consider using HTTP/2 or HTTP/3

## 🚢 CI/CD Integration

### Example GitHub Actions Workflow

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Copy files to server
        uses: appleboy/scp-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          source: "."
          target: "/var/www/sickofitgame"
      
      - name: Deploy with docker-compose
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/sickofitgame
            docker-compose down
            docker-compose up -d --build
```

## 📝 File Structure

```
SickOfIt/
├── Game/                         # Unity WebGL build output
│   ├── Build/
│   │   ├── Builds.data
│   │   ├── Builds.framework.js
│   │   ├── Builds.loader.js
│   │   └── Builds.wasm
│   └── TemplateData/
│       ├── style.css
│       └── favicon.ico
├── Dockerfile                    # Multi-stage Docker build
├── docker-compose.dev.yml        # Development environment
├── docker-compose.prod.yml       # Build and push to Docker Hub
├── docker-compose.deploy.yml     # Production deployment
├── nginx.conf                    # Nginx server configuration
├── index.html                    # Custom full-screen game wrapper
├── .dockerignore                 # Files to exclude from Docker build
├── .gitignore                    # Git ignore rules
├── auto-start.bat                # Windows: Start dev environment
├── auto-stop.bat                 # Windows: Stop dev environment
├── auto-prod.bat                 # Windows: Build, push, deploy
├── auto-deploy.bat               # Windows: Quick deploy
├── auto-copy-deploy.bat          # Windows: Copy deploy file to server
├── auto-check-status.bat         # Windows: Check production status
├── auto-ssh.bat                  # Windows: SSH into production server
├── sickofitgame-server.pem       # SSH private key (not in git)
└── README.md                     # This file
```

## 🎮 Features

- **Production-Ready Docker Workflow**: Separate dev/prod/deploy environments
  - Development with live reload (no rebuilds needed for file changes)
  - Production builds pushed to Docker Hub
  - Server pulls from Docker Hub for zero-downtime deploys
- **Full-Screen Gaming**: Game automatically fills the entire browser window
- **Mobile Optimized**: Full support for iOS Safari, Android Chrome, and mobile browsers
  - Responsive touch controls
  - Prevents scroll bouncing and pull-to-refresh
  - Handles orientation changes automatically
  - iOS-specific optimizations (Safari limitations handled gracefully)
  - Visual viewport support for accurate mobile browser sizing
- **Responsive Design**: Works on desktop and mobile devices
- **Fast Loading**: Optimized with gzip compression and caching
- **Docker Hub Integration**: Private image repository for secure deployment
- **One-Click Deployment**: Simple batch files for complete workflow
- **Secure**: Security headers and best practices implemented
- **Easy Updates**: Simple rebuild process for game updates
- **Zero Configuration**: Works out of the box with docker-compose

## 🐳 Why Docker Hub Workflow?

This setup provides professional-grade deployment:

1. **Separation of Concerns**
   - Dev environment: Fast iteration with live file mounting
   - Prod build: Optimized, immutable images
   - Deploy: Clean pulls from Docker Hub

2. **Version Control**
   - Every push to Docker Hub is a versioned artifact
   - Easy rollbacks to previous versions
   - Consistent deployments across environments

3. **Security**
   - Private Docker Hub repository
   - SSH keys never committed to version control
   - Production secrets separate from development

4. **Speed**
   - Server only downloads image (faster than git clone + build)
   - No build dependencies on production server
   - Predictable deployment times

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Docker logs: `docker-compose logs`
3. Check Unity WebGL browser console for errors

## 📄 License

Modify and use as needed for your game deployment.

---

**Built with**: Unity 6 | Docker | Nginx | ❤️
