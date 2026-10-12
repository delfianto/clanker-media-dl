# Civitai

## Carousel downloads

On `civitai.com` or `civitai.red`, open a reference image to enter the slideshow,
then click the teal download icon immediately to the left of Civitai's original
download button. Its tooltip reads **Download carousel**. This queues every image and
video in that carousel with its original filename in the configured download
directory. Original files retain any embedded generation metadata supplied by
Civitai. Files with identical names use the browser's usual numbered suffixes.
Progress, retry, and cancellation use the extension's existing Downloads tab.

When **Skip existing files** is enabled, a normal click skips files recorded as
completed in extension history. The status reports downloaded and skipped counts
separately. History cannot detect files you deleted or moved afterward.
**Shift-click the teal icon** to download the carousel again without changing the
global setting. Disabling **Skip existing files** also permits fresh downloads.

The button reads Civitai's live carousel state, including slides not mounted in
the DOM, and uses the site's pagination when more slides are available. The scope
is the open carousel; it does not collect every gallery or model version on the
model page. Keep the carousel open while it collects; after queuing you can close
it. If a lazy post gallery cannot load its advertised full count (including due
to filtering), collection fails visibly instead of downloading a partial set.
The adapter depends on Civitai's React carousel/provider structure and may need
updating if the site changes it.

## Progress and recovery

The carousel checks job status every few seconds while a download is active, so
it can recover a missed completion notification. Native downloads are checked
when tracking starts and polled while active; an early or missing browser event
cannot leave the queue waiting forever. The pre-download HTTP check has a
30-second timeout.

After updating or reloading the extension, reload any already-open Civitai tabs
to reconnect their content scripts. The button reports this when its extension
connection is no longer valid.

The Chrome keep-alive offscreen document uses a serialized create/close lifecycle.
Idle cleanup waits for creation to finish and rechecks active jobs before closing,
so rapid batches and worker recovery cannot close a document while it is loading.
Lifecycle failures are caught and reported rather than left as unhandled promises.
