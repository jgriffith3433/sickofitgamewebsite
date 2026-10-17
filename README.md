# Sick Of It — website

The public site for **Sick Of It** at [sickofitgame.com](https://sickofitgame.com): the landing page, the
playable Unity WebGL build, the blog (dev log and lore), music and shorts.

In the Hawkes Biomedical line, Sick Of It is sold as *single-use fever shots*; see `C:\Projects\AGENTS.md`.

The game itself is made in **`C:\Projects\sickofitgame-unity`**. This repo only holds what that project builds,
plus the site around it.

## How it's hosted

Static files on **GitHub Pages**, served from the root of `main` (`CNAME` is `sickofitgame.com`, `.nojekyll` is
set). There is no server: no paywall, no analytics, no backend. Pushing to `main` publishes the site.

Because Pages can't send `Content-Encoding` headers, the Unity build uses compressed `.unityweb` files with
Unity's decompression fallback. The loader unpacks them in the browser, so any static host can serve them.

## Layout

| Path | What |
|---|---|
| `index.html` | Landing page. **CLICK TO START** goes straight to `/Game/index.html` |
| `Game/index.html` | Unity loader page. It points at the current build (`gameVersion = "v110"`, `buildUrl = "v110/SickOfIt/Build/SickOfIt"`) |
| `Game/v<n>/SickOfIt/` | The WebGL build (Build/, StreamingAssets/, TemplateData/) |
| `Game/v<n>/ServerData/` | Addressables bundles (DXT for desktop, ASTC for phones) |
| `Game/v0000000/` | The template the deploy copies each new version from. Don't delete it |
| `blog/` | Blog: `index.html`, `development.html`, `lore.html`, `music.html`, `shorts.html`, `posts/*.html`, `lore/` (characters, hazards, worlds). See `blog/BLOG_README.md` |
| `music/`, `shorts/`, `videos/`, `images/` | Media used by the site and blog. Music playlist: `music/README.md` |
| `manifest.json`, `sw.js`, `offline.html`, `icons/` | PWA. `sw.js` cache name carries the build version (`sickofit-pwa-v110`) |

## Publishing a new game build

From Unity, in `sickofitgame-unity`: **Game Deploy** window → Run Full Deploy
(`Assets/Scripts/Tools/Editor/GameDeployWindow.cs`). It:

1. Deletes `ServerData\WebGL` and rebuilds Addressables.
2. Creates `Game/v<n+1>/` from `Game/v0000000/` and deletes the previous `Game/v<n>/`.
3. Copies the Addressables in and builds WebGL to `Game/v<n+1>/SickOfIt/`.
4. Replaces every `v<n>` with `v<n+1>` in this repo's text files (`Game/index.html`, `sw.js`, …).
5. Runs `auto-start.bat` and opens the browser.

Then check the game locally, and commit and push this repo to publish. The deploy never commits or pushes.

If the game page shows `Unexpected token '<'` or `unityFramework is not defined`, the loader is asking for
file names that don't exist (GitHub's 404 page is HTML). Check that `Game/index.html` points at the version
folder that's actually there, with `.unityweb` names.

## Running it locally

Any static server from the repo root works:

```bash
python -m http.server 8087
```

Then open http://localhost:8087/.

`auto-start.bat` (which the Game Deploy runs) starts the older Docker setup instead: nginx on
**http://localhost** (port 80) from `docker-compose.dev.yml`, with `Game/`, `blog/`, media and `index.html`
mounted live. `auto-stop.bat` isn't in this repo; stop it with `docker compose -f docker-compose.dev.yml down`.

## Leftovers from the old server setup

Before October 2026 the site ran behind a paywall in Docker on AWS EC2. These files belong to that setup and
are no longer used by the live site:

- `backend/` (Flask paywall: Stripe, Resend email, redeem codes). The dev compose still starts it as `paywall`.
- `nginx.conf`, `Dockerfile`, `docker-compose.prod.yml`, `docker-compose.deploy.yml`, `.dockerignore`
- `auto-prod.bat`, `auto-deploy.bat`, `auto-copy-deploy.bat`, `auto-check-status.bat`, `auto-logs-*.bat`, `auto-ssh.bat`
- `SETUP.md`, `PWA_CHECKLIST.md`, `UNITY_INTEGRATION_PROMPT.txt`

They can be removed once local dev no longer needs Docker.

## Versions and What's new

Every go live is a release, made by Hawkes Studio (`hawkesstudio/src/releases.ts`): a semver version bumped at go
live (minor when players get something new, patch for fixes) plus the build (`Game/v<n>`), shown as "v1.4.0 · build 107"
and tagged `v<version>` in this repo and in `sickofitgame-unity`. Studio adds the release to `releases.json` (newest
first) in the go-live commit, with the notes J approved. `whatsnew.html`, the landing page and the game page's version
label read it through `js/hawkes-release.js` (a copy of `hawkesstudio/clients/web/hawkes-release.js`).
Website changes go to this repo's `beta` branch (the beta build lands on top of it); going live moves `main` to it.
