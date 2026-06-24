# JPG6

## What it does
- Single download button injection.
- Gallery batch download.

## Quirks & Nonsense
JPG6 hides their full-resolution image URLs inside arbitrary `data-object` HTML attributes instead of putting them in a normal `<a href>` or `<img>` tag like civilized developers. We scrape the DOM, extract the JSON from the data attribute, and reconstruct the direct URLs.
