# Gallery Image Deep Linking

## Problem summary

PhotoSwipe gallery state is currently local to the open page. The active image
is not represented in the URL, direct links cannot reopen a selected image, and
clicking a gallery thumbnail inside a rich page preview can open a second
lightbox inside the preview modal.

## Goal

Give gallery images durable URL identity and use that identity to hand a click
from a page preview to the full page, where the same image opens immediately in
PhotoSwipe.

## Scope

- Define the stable gallery-image URL contract in
  `specification/gallery-lightbox/spec.md`.
- Render each gallery anchor with its collected image UID.
- Track the active PhotoSwipe image in a query parameter without creating a
  history entry for every slide.
- Open the matching image automatically when a full page is loaded with a
  valid gallery-image parameter.
- In preview mode, suppress the nested PhotoSwipe lightbox and relay the
  clicked image UID to the owning page-preview controller.
- Have the owning page navigate to its canonical full-page URL with that image
  parameter set.
- Add focused regression coverage for URL preservation, encoding, markup, and
  preview-message wiring.

## Non-goals

- Changing PhotoSwipe controls, gestures, animation, or visual styling.
- Giving non-gallery Markdown images a deep-link contract.
- Adding one browser-history entry per slide.
- Making invalid or stale image UIDs resolve to another image.

## Implementation phases

1. Specify the query parameter, lifecycle, invalid-value behavior, and preview
   handoff.
2. Add shared URL helpers and stable gallery-image identity to rendered markup.
3. Wire PhotoSwipe open/change/close state to the URL and honor direct links.
4. Replace nested preview lightboxes with a validated same-origin handoff to
   the full page.
5. Add focused tests, run available verification, record results, and close
   the packet.

## Dependencies and risks

- PhotoSwipe's `change`, `close`, and `loadAndOpen` APIs are the local
  `photoswipe@5.4.4` contract used by this repository.
- Collected image UIDs may contain URL-significant characters such as `#`;
  `URLSearchParams` must own encoding and decoding.
- A document can contain more than one gallery. Initialization and deep-link
  lookup must therefore target `.pswp-gallery` instances rather than the
  historical singleton `#my-gallery`.
- Preview messages cross an iframe boundary. The parent must validate both the
  sending window and same-origin source, and construct the destination from its
  own canonical preview target rather than trusting a child-provided URL.

## Exit criteria

- Opening a gallery image adds `gallery-image=<uid>` to the current URL.
- Moving between images replaces that value; closing removes only that
  parameter.
- Loading a full page with a valid value opens that exact image.
- Invalid values fail quietly without opening a different image.
- Clicking a gallery image inside a rich preview opens the canonical full page
  with the selected image already open, never a nested PhotoSwipe instance.
- Unrelated query parameters and ordinary page fragments are preserved.
- Focused tests and the repository plan consistency check pass, or any
  environment-only verification gaps are recorded.
