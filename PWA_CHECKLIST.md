PWA verification checklist — run after deploying the site and reloading nginx

1) Deploy and reload nginx

   - Add the contents of `nginx-pwa.conf` into your site's `server { ... }` block (or include it).
   - Test config and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

2) Quick HTTP header checks

```bash
curl -I https://sickofitgame.com/manifest.json
curl -I https://sickofitgame.com/sw.js
curl -I https://sickofitgame.com/icons/icon-192.png
```

Expectations:
- `manifest.json` -> `Content-Type: application/manifest+json` (or application/json)
- `sw.js` -> served with `Cache-Control: no-cache...` (so SW updates are picked up)
- icons -> `Cache-Control: public, max-age=31536000, immutable`

3) Browser checks (Chrome/Edge recommended)

- Open DevTools → Application → Manifest: confirm fields, icons, `start_url`, and `display: standalone`.
- Application → Service Workers: confirm `sw.js` is registered and active; scope should be `/`.
- Console: ensure no service-worker registration errors.
- Application → Service Workers → check 'Update on reload' while testing changes to `sw.js`.

4) Offline test

- In DevTools, Application → Service Workers, enable `Offline` (or use network throttling -> Offline).
- Reload the page: the cached shell should load or `offline.html` should appear for navigation requests.

5) Add-to-home-screen test (mobile / device emulation)

- In mobile emulation, visit the site over HTTPS and confirm the browser shows 'Add to Home screen' or use the install icon in the address bar.

6) Localhost testing

- You can test locally on `http://localhost` (service workers allowed on localhost).
- If you need HTTPS locally, use your existing nginx with a local certificate (mkcert) or test on your deployed server.

7) Common fixes

- If the manifest isn't detected: ensure `<link rel="manifest" href="/manifest.json">` exists in the served page HTML and the path is reachable.
- If SW registration fails: check `sw.js` is reachable at `/sw.js` and not blocked by a different scope.
- If icons don't show: ensure PNGs exist at `icons/icon-192.png` and `icons/icon-512.png` and are referenced by `manifest.json`.

Useful DevTools commands (Console) to inspect registration:

```js
navigator.serviceWorker.getRegistration().then(r => console.log(r));
fetch('/manifest.json').then(r=>r.json()).then(j=>console.log(j));
```

Files added to repo:
- `nginx-pwa.conf` (snippet)
- `PWA_CHECKLIST.md` (this file)
