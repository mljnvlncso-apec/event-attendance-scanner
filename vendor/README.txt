APEC GALA V12.2 — CAMERA SCANNER LIBRARY (INCLUDED)

This folder already contains the required file:
  html5-qrcode-2.3.8.min.js

Upload this whole vendor/ folder to the GitHub Pages repository root so the final path is:
  vendor/html5-qrcode-2.3.8.min.js

index.html loads this local file. The service worker (sw.js) caches it after a successful online visit so the camera library still loads after a later offline page reload. A complete offline test requires opening the scanner online once, letting the service worker finish installing, and downloading the roster.

VERIFICATION
- Source: official npm package html5-qrcode@2.3.8 (https://registry.npmjs.org/html5-qrcode/-/html5-qrcode-2.3.8.tgz)
- npm tarball integrity confirmed: sha512-jsr4vafJhwoLVEDW3n1KvPnCCXWaQfRng0/EEYk1vNcQGcG/htAdhJX0be8YyqMoSz7+hZvOZSTAepsabiuhiQ==
- The file is byte-identical to html5-qrcode.min.js inside that package and to
  https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js
- SHA-256: 660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e

LICENSE
html5-qrcode is Apache-2.0 licensed. The full licence text is in LICENSE-html5-qrcode.txt.
