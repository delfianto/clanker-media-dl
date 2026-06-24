# ImgBox

## What it does
- Single download button injection.
- CDN → viewer redirect.
- Gallery batch download.

## Quirks & Nonsense
ImgBox is fairly normal, but it gets an 8-character path guard regex to make sure we don't inject download buttons on random non-viewer pages. It also features a thumbnail→full-res URL transform so we don't even have to fetch the viewer page to get the direct image link. Bandwidth saved, polar bears cheered.
