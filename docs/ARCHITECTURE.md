# Architecture (For The Curious / Masochistic)

The following is a real description of what happens when you press the download button.

This is not a joke. This is actually how the extension has to work because Manifest V3 is what happens when a browser vendor redesigns their extension API while clearly never having talked to an extension developer. Every single layer of this is load-bearing. The author did not choose this architecture for fun. The author chose this architecture because every simpler path was bricked.

---

### Single-image download

```
CDN URL hits redirector.ts (ISOLATED world, document_start)
  → location.replace() to viewer page

Viewer page loads isolated.ts (ISOLATED world, document_idle)
  → reads settings from browser.storage.local
  → dispatches __md_config__ CustomEvent to MAIN world
  → listens for window.postMessage relay requests

main.ts (MAIN world, document_idle)
  → receives config via __md_config__ listener
  → dispatches to host adapter (imagebam/imgbox/imgbb/bunkr)
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
  → sanitizeFilename() before browser.downloads.download()
  → returns ArrayBuffer + contentType

isolated.ts
  → posts MD_RESPONSE back with buffer as transferable [zero-copy]

downloader.ts (MAIN world)
  → Blob from ArrayBuffer → objectURL → <a> click
  → file saved to disk
```

### Gallery batch download

```
Gallery page loads → isolated.ts → __md_config__ → main.ts
  → runGalleryAdapter(model, config, adapter.activateGallery)
  → collects items (DOM strategy or model.collectAllItems)
  → fetches pagination pages if present, de-duplicates
  → adapter.injectGalleryButton — hoster-specific HTML, CSS, placement
  → user clicks → triggerDownload()
  → posts MD_GALLERY_START to ISOLATED → SW

background/gallery.ts (Service Worker)
  → partitions items: isMediaFile() → image queue + media queue
  → runQueue(job, imageEntries, maxParallelImg)
  → runQueue(job, mediaEntries, maxParallelVid)
  → both run concurrently via Promise.all
  → per item: fetchWithRetry(viewer page) → model.extractFromViewer()
    → model.resolveUrl() (bunkr signing) → sanitizeFilename()
    → browser.downloads.download() → onChanged listener confirms completion
  → transient errors retried 3x with 1s/2s/4s backoff
  → progress broadcast to options page + all tabs
```

All of this happens so you can press a button and get a JPEG. Just let that sink in.
