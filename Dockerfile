# Use official nginx alpine image for smaller size
FROM nginx:alpine AS base

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration (changes very rarely)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Development target - for local development
# Game/, PreGame/, blog/, and index.html are mounted as volumes for live editing.
# PWA assets are baked in so they're available without additional mounts.
FROM base AS development

# Copy only PWA files and blog (Game/, PreGame/, blog/, and index.html can be overridden by volume mounts)
COPY icons/ /usr/share/nginx/html/icons/
COPY offline.html /usr/share/nginx/html/offline.html
COPY manifest.json /usr/share/nginx/html/manifest.json
COPY sw.js /usr/share/nginx/html/sw.js
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY images/ /usr/share/nginx/html/images/
COPY blog/ /usr/share/nginx/html/blog/
COPY music/ /usr/share/nginx/html/music/
COPY shorts/ /usr/share/nginx/html/shorts/
COPY videos/ /usr/share/nginx/html/videos/

CMD ["nginx", "-g", "daemon off;"]

# Production target - for deployment with baked-in files
FROM base AS production

# Copy files in order of change frequency (least to most)
# Game/ and PreGame/ are last since they change most frequently - only these layers rebuild on game updates
COPY icons/ /usr/share/nginx/html/icons/
COPY offline.html /usr/share/nginx/html/offline.html
COPY manifest.json /usr/share/nginx/html/manifest.json
COPY sw.js /usr/share/nginx/html/sw.js
COPY favicon.ico /usr/share/nginx/html/favicon.ico
COPY images/ /usr/share/nginx/html/images/
COPY blog/ /usr/share/nginx/html/blog/
COPY music/ /usr/share/nginx/html/music/
COPY shorts/ /usr/share/nginx/html/shorts/
COPY videos/ /usr/share/nginx/html/videos/
COPY index.html /usr/share/nginx/html/index.html
COPY PreGame/ /usr/share/nginx/html/PreGame/
COPY Game/ /usr/share/nginx/html/Game/

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
