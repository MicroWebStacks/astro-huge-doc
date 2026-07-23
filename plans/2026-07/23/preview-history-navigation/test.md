# Preview History Navigation — Test Notes

## Focused behavior

The focused Node suite covers:

- ordered route recording and duplicate suppression;
- Back/Forward boundary state;
- forward-branch truncation;
- query/hash removal and cross-origin route rejection;
- rendered-page route announcements and action messages;
- disabled-state updates from the extension;
- accessible arrow labels, right alignment, and Home-route availability.
- the origin-remapping-safe relay contract: iframe window identity is required,
  exact localhost-origin matching is absent, and state delivery permits the
  mapped frame origin.

## Extension host

The existing active-route/follow/lock case now drives the internal preview
message boundary through Back and Forward and verifies the expected rendered
route and history index after each action.

Result: PASS on Windows x64, VS Code 1.100.3 / Node 20.19.0. Final suite runtime
was 8,909 ms; all four cases passed with no failure or timeout.

## Production build

The server and client builds completed. Inspection of the generated server
manifest confirmed the breadcrumb controls and bundled preview-history client
script are present.
