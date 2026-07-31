# Gallery Lightbox And Deep-Link Contract

## Scope

This specification governs authored YAML galleries rendered by
`src/components/gallery/gallery.astro`, their PhotoSwipe lightbox state, and
gallery-image activation from a rich page preview.

It does not govern standalone Markdown images, diagram lightboxes, table
modals, or embedded third-party iframes.

## Stable image identity

- Every rendered gallery item MUST expose its collected gallery-asset UID as
  `data-gallery-image`.
- The UID is the stable page-local selector for URL state. Asset URLs and
  zero-based slide indexes MUST NOT be used as the durable identity.
- A page MAY contain multiple galleries. Lookup covers every
  `.pswp-gallery` in document order; if authored content repeats the same UID,
  the first matching item wins.

## URL contract

- The active gallery image is represented by the query parameter
  `gallery-image=<uid>`.
- `URLSearchParams` owns encoding and decoding. UIDs containing `#`, spaces,
  or other URL-significant characters remain exact after a round trip.
- Opening an image or changing slides MUST update `gallery-image` with
  `history.replaceState`; slide browsing MUST NOT create one browser-history
  entry per image.
- Closing PhotoSwipe MUST remove only `gallery-image`, preserving unrelated
  query parameters and ordinary page fragments.
- Loading a normal full page with a value matching a rendered gallery item
  MUST open PhotoSwipe at that item after the lightbox controller initializes.
- A missing, empty, stale, or unknown value MUST fail quietly: no lightbox is
  opened, no substitute image is selected, and page rendering continues.

## Rich-preview handoff

- A document marked `data-preview-mode="true"` MUST NOT initialize PhotoSwipe
  for its galleries. This prevents a gallery lightbox from nesting inside the
  rich page-preview modal.
- Activating a gallery item in preview mode MUST send the selected
  `data-gallery-image` UID to the page-preview owner.
- The owner MUST accept the handoff only from the currently active preview
  iframe and the current origin.
- The owner MUST construct the destination from its own canonical target URL,
  set `gallery-image` through `URLSearchParams`, and navigate the owning page.
  It MUST NOT trust a child-provided destination URL.
- The destination full page then applies the normal URL contract and opens the
  selected image automatically.

## Compatibility and failure behavior

- Normal full-page gallery interaction remains PhotoSwipe-driven.
- The contract applies in static, SSR, lite, and VS Code extension-preview run
  modes.
- If script execution or PhotoSwipe loading fails, gallery anchors retain
  their ordinary asset `href` fallback on full pages.
- The handoff message is an internal same-origin UI protocol, not a public
  cross-origin API.
