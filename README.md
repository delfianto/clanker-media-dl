# clanker-media-downloader

> A one-click image downloader for image hosting sites, built as a MV3 browser extension.  
> Engineered with the structural integrity of a nuclear bunker to save JPEGs.

---

## What Is This

A browser extension. It puts a download button on images. That's it. That's the whole pitch.

You visit a page on [ImageBam](https://imagebam.com), [ImgBox](https://imgbox.com), or [ImgBB](https://imgbb.com), and instead of right-click-saving-as like some kind of prehistoric cave-dweller, you get a button. You press the button. The image downloads. Revolutionary.

Behind this trivial act of clicking a button lies:

- A **Manifest V3 service worker** that proxies cross-origin fetch requests because Chrome in its infinite wisdom decided content scripts shouldn't be able to just download things normally
- A **dual content-script world architecture** with an elaborate `postMessage` bridge relay system because MV3 extension worlds cannot talk to each other like adults
- **TypeScript 7 RC** — yes, the release candidate, because apparently downloading JPEGs required the absolute bleeding edge of Microsoft's type system
- A full **hoster model abstraction layer** with redirect rules, CDN URL rewriting, and per-site override schemas backed by `browser.storage.local` — for three websites
- `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true` — a tsconfig so strict it would reject your grandmother's birthday card for insufficient type narrowing
- A settings page. An **options page**. With CSS. For a download button.

Is this over-engineered? Yes. Does that bother the author? No. Were several serious architectural decisions made at 2am about the correct way to transfer `ArrayBuffer` as a transferable across a postMessage boundary to avoid memory doubling? Also yes.

---

## Supported Sites

| Site | What it does |
|------|-------------|
| ImageBam | Injects download button, handles CDN → viewer redirect |
| ImgBox | Same but with an 8-character path guard regex |
| ImgBB | Same but slightly different DOM |

If your favorite image hosting site isn't here: that's your problem, not mine.

---

## HOW TO USE IT

> **READ THIS SECTION. THIS IS THE ENTIRE USER GUIDE. THERE IS NO OTHER USER GUIDE.**

### You Will NOT Find This On:

- ❌ The Chrome Web Store
- ❌ Firefox Add-ons (addons.mozilla.org)
- ❌ The Opera add-ons store (lmao)
- ❌ Any browser extension marketplace anywhere on earth
- ❌ A published release with a nice changelog and semantic versioning

**The author has absolutely no intention, desire, plan, roadmap item, backlog ticket, or fever dream of ever submitting this to any extension marketplace.** None. Zero. The Chrome Web Store review process can eat a bag of rocks.

### You WILL:

Clone the repo and load it yourself like a person who knows what a terminal is.

```sh
git clone <this repo>
cd clanker-media-downloader
bun install
bun run build
```

Then go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", point it at `build/chrome/`.

Firefox:
```sh
bun run build:firefox
```
Load `build/firefox/` via `about:debugging`.

That's it. You're done. You now have a download button on images. Congratulations.

---

## Support

There is no support.

If you open an issue, it will be read. Whether anything happens after that is entirely a function of the author's mood, the phase of the moon, and how many other things are currently on fire. Probably nothing happens. Probably you sit there. Probably the issue eventually gets stale-bot'd into the void.

Do not open a support ticket. There is no support ticket system. This README is the support system. You are reading the support system right now.

---

## Warranty

There is no warranty.

This software is provided "as is," which is a legal way of saying "it works on the author's machine and that's the only machine the author cared about." If it breaks your browser, corrupts your downloads folder, causes your cat to look at you judgmentally, or somehow triggers a cross-origin security audit at your workplace — that's between you and your life choices.

---

## A Note On Code Quality

This extension was written with significant assistance from a Large Language Model. The author has been asked to feel shame about this. The author does not feel shame about this.

Call it slop code. Call it AI-generated garbage. Call it gruel code, vibe code, prompt-to-shipped, ChatGPT spaghetti, LLM drool, whatever the currently fashionable pejorative is this week on Hacker News. The extension works. The images download. The TypeScript compiles clean with zero errors. The linter is satisfied. The architecture is, somewhat irritatingly, better than most hand-written browser extensions found in the wild.

If your feelings about LLM-assisted code are stronger than your desire to have a working download button: great, good for you, the Chrome Web Store has twelve other extensions for this, go use those, godspeed.

---

## Architecture (For The Curious / Masochistic)

The following is a real description of what happens when you press the download button:

```
CDN URL hits redirector.ts (ISOLATED world, document_start)
  → location.replace() to viewer page

Viewer page loads isolated.ts (ISOLATED world, document_idle)
  → reads settings from browser.storage.local
  → dispatches __md_config__ CustomEvent to MAIN world
  → listens for window.postMessage relay requests

main.ts (MAIN world, document_idle)
  → receives config via __md_config__ listener
  → dispatches to host adapter (imagebam/imgbox/imgbb)
  → adapter injects button into DOM
  → on click: posts MD_REQUEST via postMessage bridge

bridge.ts (MAIN world)
  → pending Map<id, resolve/reject>
  → posts to window, isolated.ts picks it up

isolated.ts (relay)
  → receives MD_REQUEST
  → browser.runtime.sendMessage MD_FETCH_BLOB to SW

background/index.ts (Service Worker)
  → fetch() with credentials:omit, 30s timeout
  → returns ArrayBuffer + contentType

isolated.ts
  → posts MD_RESPONSE back with buffer as transferable [zero-copy]

downloader.ts (MAIN world)
  → Blob from ArrayBuffer → objectURL → <a> click
  → file saved to disk
```

All of this happens so you can press a button and get a JPEG. Every single layer of this is load-bearing because MV3 is what happens when a browser vendor redesigns their extension API while clearly never having talked to an extension developer. The author did not choose this architecture for fun. The author chose this architecture because every simpler path was bricked.

---

## Tech Stack

| Thing | Why |
|-------|-----|
| TypeScript 7 RC | Felt dangerous. Lived. |
| Bun | npm is slow and boring |
| vite-plus (`vp`) | Unified VoidZero toolchain — lint, fmt, typecheck, build |
| vite-plugin-web-extension | Extension builds without wanting to die |
| webextension-polyfill | `browser.*` everywhere, `chrome.*` nowhere |

---

## Adding More Sites

See `CLAUDE.md` for the full hoster model documentation. The short version:

1. Write a `HosterModel` in `src/hosts/{id}/model.ts`
2. Write a DOM adapter in `src/hosts/{id}/adapter.ts`
3. Add it to `src/hosts/index.ts`
4. Wire up the manifest entries in `vite.config.ts`
5. `bun run check`

The author may or may not ever do this. No commitments are being made here.

---

## License

MIT. Take it. Fork it. Reskin it. Sell it on the Chrome Web Store under a different name and make millions (you won't). The author cannot stop you and, frankly, lacks the energy to try.

---

*Personal tool. No commercial intent. No support. No warranty. Yes, an LLM wrote a substantial portion of this. No, the author does not care what you think about that.*
