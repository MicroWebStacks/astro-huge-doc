# Plans

Use this directory for dated planning packets.

Each plan folder uses this shape:

```text
plans/YYYY-MM/
  DD-<slug>/
    plan.md
    implementation.md
    test.md
```

Add `survey.md` before `plan.md` when the work needs discovery or review before
scope is approved. Create `test.md` only when validation notes are useful to
preserve. Plans move to `closed` as soon as implementation is finished; if
`implementation.md` is marked `[######] Done ...`, the packet belongs in
`closed.md`. Testing does not block closure and can be recorded before or after
that point.

Keep `open.md` and `closed.md` as concise tables rather than prose lists so
packet status stays easy to scan and compare.
