# Umami Analytics - Quick Start Guide

## 🚀 Quick Setup

### 1. Start Umami (Development)

```powershell
docker-compose -f docker-compose.dev.yml up -d
```

### 2. Configure Umami

1. Visit: http://localhost:3000
2. Login: `admin` / `umami` (change password immediately!)
3. Add website: Settings → Websites → Add website
4. Name: `Sick Of It`, Domain: `localhost`
5. Copy the **Website ID**

### 3. Update Website

Replace `YOUR_WEBSITE_ID` in all HTML files with your Website ID from step 2.

**Files to update:**
- index.html
- blog/index.html
- blog/development.html
- blog/lore.html
- blog/music.html
- blog/posts/yooba.html
- blog/lore/characters/yooba.html

**Find:**
```html
data-website-id="YOUR_WEBSITE_ID"
```

**Replace with:**
```html
data-website-id="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Also update in `blog/development.html` JavaScript:**
```javascript
const WEBSITE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

### 4. Test

1. Open http://localhost
2. Navigate around the site
3. Check http://localhost:3000 → Realtime to see your page views
4. Check http://localhost/blog/development.html to see the stats dashboard

## 📊 What's Been Implemented

### ✅ Website Analytics

- **Page view tracking** - Automatic on all pages
- **Unique visitor tracking** - Via Umami's built-in visitor identification
- **Custom event tracking** - Ready for Unity game events

### ✅ Docker Setup

- `docker-compose.dev.yml` - Development environment with Umami + PostgreSQL
- `docker-compose.deploy.yml` - Production deployment configuration
- Nginx proxy at `/umami/*` routes to Umami container

### ✅ Analytics Dashboard

Location: [blog/development.html](blog/development.html)

Displays:
- 📈 Total Page Views
- 👥 Unique Visitors  
- 🎮 Total Plays (game_start events)
- 🏆 Level 1 Completions (level1_complete events)

### ✅ Unity Integration (Ready)

JavaScript wrapper: [umami-game-events.js](umami-game-events.js)

**Available functions for Unity:**
- `trackGameStart()`
- `trackLevel1Complete()`
- `trackLevel2Complete()`
- `trackLevel3Complete()`
- `trackLevel4Complete()`
- `trackPlayerDeath(cause)`
- `trackGameOver()`

## 🎮 Unity Integration

See [UNITY_ANALYTICS_INTEGRATION.md](UNITY_ANALYTICS_INTEGRATION.md) for complete Unity implementation guide.

**Quick summary for your Unity developer:**

Create an `AnalyticsManager.cs` script that calls JavaScript functions via `[DllImport("__Internal")]`:

```csharp
[DllImport("__Internal")]
private static extern void trackGameStart();

public void TrackGameStart()
{
    #if UNITY_WEBGL && !UNITY_EDITOR
        trackGameStart();
    #endif
}
```

Then call from your game code:
```csharp
AnalyticsManager.Instance.TrackGameStart();
AnalyticsManager.Instance.TrackLevelComplete(1);
```

## 📁 Files Created/Modified

### New Files
- ✨ `umami-game-events.js` - JavaScript wrapper for Unity events
- 📖 `UMAMI_SETUP.md` - Detailed setup instructions
- 📖 `UNITY_ANALYTICS_INTEGRATION.md` - Unity integration guide
- 📖 `ANALYTICS_QUICKSTART.md` - This file
- 🔒 `.env.example` - Environment template for production

### Modified Files
- 🐳 `docker-compose.dev.yml` - Added Umami + PostgreSQL
- 🐳 `docker-compose.deploy.yml` - Added Umami + PostgreSQL
- 🌐 `nginx.conf` - Added Umami proxy at `/umami/`
- 📄 All HTML files - Added Umami tracking script
- 📊 `blog/development.html` - Added analytics dashboard

## 🔧 Troubleshooting

### Umami not loading?
```powershell
docker ps  # Check containers are running
docker logs umami-dev  # Check Umami logs
docker logs umami-postgres-dev  # Check database logs
```

### Events not tracking?
- Open browser console (F12) and check for errors
- Verify Website ID is correct in HTML files
- Check that `/umami/script.js` loads successfully (Network tab)

### Dashboard showing "N/A"?
- Wait a few minutes for data to be collected
- Verify Website ID is updated in `blog/development.html`
- Check browser console for API errors

## 📚 Documentation

- **Setup Guide**: [UMAMI_SETUP.md](UMAMI_SETUP.md)
- **Unity Integration**: [UNITY_ANALYTICS_INTEGRATION.md](UNITY_ANALYTICS_INTEGRATION.md)
- **Umami Official Docs**: https://umami.is/docs

## 🚢 Production Deployment

1. Create `.env` file on server:
   ```bash
   UMAMI_DB_PASSWORD=your_secure_password
   UMAMI_APP_SECRET=your_32_character_secret
   ```

2. Deploy:
   ```bash
   docker-compose -f docker-compose.deploy.yml up -d
   ```

3. Access Umami at: `http://your-server-ip:3000`

4. Configure website in Umami and update Website IDs

5. Rebuild and deploy website with updated IDs

See [UMAMI_SETUP.md](UMAMI_SETUP.md) for detailed production setup.

## 🎯 Next Steps

1. **Now**: Set up Umami locally and update Website IDs
2. **Unity**: Implement analytics tracking using the Unity guide
3. **Test**: Verify events appear in dashboard
4. **Deploy**: Push to production with secure credentials

---

**Need help?** Check the detailed guides:
- [UMAMI_SETUP.md](UMAMI_SETUP.md) - Complete setup instructions
- [UNITY_ANALYTICS_INTEGRATION.md](UNITY_ANALYTICS_INTEGRATION.md) - Unity implementation
