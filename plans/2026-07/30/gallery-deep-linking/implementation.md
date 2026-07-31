# Gallery Image Deep Linking Implementation

## Progress

[#####] Done - URL tracking, direct deep-link opening, and preview-to-full-page gallery handoff are implemented.

## Changes

- Added `src/libs/gallery-deep-link.js` as the shared URL/protocol boundary:
  `gallery-image`, UID-safe `URLSearchParams` helpers, and the internal
  `microwebstacks.previewGalleryImage` message name.
- Updated `src/components/gallery/gallery.astro` to expose every collected
  gallery-asset UID through `data-gallery-image`.
- Removed the historical singleton `#my-gallery` assumption. The controller
  now initializes every `.pswp-gallery`, allowing URL lookup to search multiple
  galleries in document order.
- Updated `src/components/gallery/gallery.js` to:
  - reflect PhotoSwipe's active slide in `gallery-image` on `change`;
  - remove only that parameter on `close`;
  - locate a matching UID and call `loadAndOpen` on direct page load;
  - skip PhotoSwipe entirely in `data-preview-mode="true"` documents; and
  - capture preview-gallery clicks before the generic preview link interceptor,
    then relay only the selected UID to the parent.
- Updated `src/layout/link_preview.js` to accept that relay only from the
  current same-origin preview iframe, construct the destination from the
  parent's canonical target, add `gallery-image`, and navigate the owning page.
- Added `test/gallery-deep-link.test.js` for UID encoding, unrelated URL-state
  preservation, preview-hash removal, multiple-gallery identity, PhotoSwipe
  lifecycle wiring, and message validation.
- Captured the durable behavior in
  `specification/gallery-lightbox/spec.md`.

## Decisions

- The collected gallery-asset UID is the URL identity. Asset URLs can change
  with deployment/version routing, and indexes become unstable when authored
  gallery order changes.
- Slide changes use `history.replaceState`, preventing Back history from
  becoming one entry per image while keeping copied URLs current.
- An invalid UID is ignored rather than redirected to the first image or
  removed from the URL.
- The preview child sends no destination URL. The parent trusts only the UID
  after validating the active iframe and origin, then owns destination
  construction.
- The preview handler uses document-capture registration and
  `stopImmediatePropagation()` because the existing generic click-through
  listener also runs in document capture. This guarantees the raw gallery
  asset link and nested PhotoSwipe cannot win the click race.

## Deviations and follow-ups

- No behavior deviation from the specification was required.
- A hands-on built-browser pass remains an environment follow-up because this
  checkout's installed dependency tree is missing both `glob/index.js` and
  Astro's `esbuild/index.js`; source compilation and the existing gallery
  integration tests cannot start until dependencies are repaired.
