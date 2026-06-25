# GirlsReleased

## What it does

- Gallery batch download.
- Full multi-set album crawls.
- API pagination bypass.

## Quirks & Nonsense

GirlsReleased is an absolute nightmare masquerading as a modern web app.

It is a React Single Page Application (SPA) with infinite scroll. If you rely on DOM scraping, you will only ever download the first 100 sets of a gallery before it stops.

To combat this, the extension bypasses the DOM entirely and paginates their hidden internal API (`/api/0.3/sets/site/...`). The API returns a "peek-ahead sentinel" on page boundaries (because of course it does), so we deduplicate by ID on the fly.

Some of their sub-sites are token-gated behind a login session. The API demands an `x-token` header. Since we operate via the content script, we literally reach into their `localStorage`, steal the `accessToken`, and attach it to our own paginated API calls so we can crawl gated galleries.

And if the API completely fails? We fall back to polling the DOM for an anchor href injection, just to make sure we get _something_.
