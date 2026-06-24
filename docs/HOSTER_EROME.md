# Erome

## What it does
- Single download button injection.
- Gallery batch download.

## Quirks & Nonsense
Erome is entirely video-focused and heavily relies on the `Referer` header. 

If you try to download a video without the exact `Referer` header pointing back to the viewer page, the CDN laughs at you and drops the connection. So, the extension leverages `declarativeNetRequest` to dynamically modify the headers of our Service Worker fetch requests on the fly. 

Also, we split media queues in the background worker, ensuring 2GB videos don't clog up the image pipeline, downloading them 1 by 1 while images fly at 5x concurrency.
