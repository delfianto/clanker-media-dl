# Supported Hosters

This extension supports downloading from the following hosters. If your favorite image hosting site isn't here: that's your problem, not mine.

The architecture isolates all hoster-specific quirks into their own respective configuration models and DOM adapters. The service worker doesn't know what an "imagebam" is, it just asks the model to extract URLs.

## Hoster Quirks & Documentation

Because the web is a terrible place built on hacks and dreams, every image hoster operates entirely differently. Some are normal. Some sign their CDN URLs with cryptographic hashes. Some serve 200 OK HTML pages instead of JPEGs when you get rate limited. Some use infinite-scroll React SPAs that hide pagination links from the DOM entirely.

Each hoster's unique brand of nonsense is documented below:

- [ImageBam](HOSTER_IMAGEBAM.md)
- [ImgBox](HOSTER_IMGBOX.md)
- [ImgBB](HOSTER_IMGBB.md)
- [Bunkr](HOSTER_BUNKR.md)
- [Erome](HOSTER_EROME.md)
- [JPG6](HOSTER_JPG6.md)
- [GirlsReleased](HOSTER_GIRLSRELEASED.md)

---

## Adding More Sites

Do you want to subject yourself to this architecture? Fine. Here is how you do it.

1. **Write a `HosterModel`** in `src/hosts/{id}/model.ts`. 
   Define the redirect rules, download config, gallery config, and any optional `extractFromViewer`/`resolveUrl` hooks for Service Worker-side peculiarities.
2. **Write a DOM adapter** in `src/hosts/{id}/adapter.ts`.
   Implement `activate()` for single-download injection and `activateGallery()` for gallery button injection (you get to write your own HTML, CSS, and placement logic).
3. **Add it** to `src/hosts/index.ts`.
4. **Wire up** the manifest entries in `vite.config.ts` so the extension actually runs on the domains.
5. **Run the gauntlet**: `bun run check && bun test && bun run build`

The shared gallery runner has **zero** `model.id === "my_hoster"` checks. The SW has **zero** hoster-specific logic. All peculiarities live in the model and adapter. This is the way it should be. It was not always this way, and the git log bears the scars.

The author may or may not ever accept a PR adding a new site. No commitments are being made here.
