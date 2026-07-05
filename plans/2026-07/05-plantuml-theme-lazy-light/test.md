# Test: PlantUML Theme-Aware Rendering

Status: not yet implemented — no proof recorded yet. Checklist mirrors the
Exit Criteria in `plan.md`; fill in commands run and actual results once each
phase lands.

- [ ] Default (dark) load of a PlantUML page shows the dark SVG immediately,
      no request to `/diagrams/light-svg`.
- [ ] Forcing light theme triggers `/diagrams/light-svg?uid=...`, swaps the
      `<object data>`, and renders light ink on a light backdrop with no
      layout shift versus the dark version.
- [ ] Reloading the light-themed page is a cache hit (no second Kroki
      round-trip).
- [ ] Fullscreen modal backdrop + cloned SVG match the active theme, both
      themes.
- [ ] BlockDiag diagrams elsewhere are visually unchanged in both themes.
