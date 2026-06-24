# Bunkr

## What it does
- Single download button injection.
- CDN → viewer redirect.
- Gallery batch download.

## Quirks & Nonsense
Oh boy. The whole beast. Bunkr is a multi-headed hydra of edge cases.

- **21 Mirror Domains:** Yes, 21. We have to support all of them.
- **`window.albumFiles`:** Instead of scraping the DOM like cavemen, we extract the gallery array directly from the global window object.
- **Viewer-Page HTML Extraction:** For individual items, we sometimes have to scrape the viewer page to find the actual CDN URL.
- **CDN URL Signing:** Bunkr loves to sign their URLs via `glb-apisign.cdn.cr`. The extension intercepts this API and signs the URLs automatically so the CDN doesn't immediately hand us a 403 Forbidden.
- **"Server under maintenance" Detection:** Because why would an API return a 503 when it can return a 200 OK with a maintenance HTML page?
- **Video Fallbacks:** We have fallback logic to scrape `<source>` and `<video>` tags for video pages.
- **Per-hoster CSS Injection:** Custom styles because their DOM is special.
