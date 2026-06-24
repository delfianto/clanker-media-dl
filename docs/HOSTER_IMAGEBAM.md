# ImageBam

## What it does
- Single download button injection.
- CDN → viewer redirect.
- Gallery batch download.

## Quirks & Nonsense
ImageBam has a delightful habit of sometimes assigning absolute mojibake garbage as filenames. We're talking broken Unicode from encoding mismatches like `54­Øÿ╝­ØÖº­ØÖÜ­ØÖû 69.jpg`. Sometimes they just use UUIDs. 

Because nobody wants to save a file named `54­Øÿ╝­ØÖÚ­ØÖÜ­ØÖû 69.jpg`, the extension has a "Use Fallback Name" toggle (on by default) which detects this garbage and replaces it with the ImageBam file ID right from the URL, preserving the extension. 

So your mojibake mess gracefully becomes `ME2PNA7.jpg`. Normal filenames (ASCII, CJK, Japanese, Korean) pass through untouched. Revolutionary.
