# Mobile Drawer Navigation

## Problem

On mobile, choosing a page navigates successfully but leaves the Pages drawer
open. Its persisted open state is restored on the destination page, obscuring
the content.

## Scope

- Close either mobile navigation drawer when one of its links is activated.
- Support both server-rendered and lazily populated navigation links.
- Persist the closed state before navigation.
- Preserve desktop navigation behavior.

## Implementation

1. Centralize the mobile toggle storage-key calculation.
2. Delegate link activation from each mobile navigation element and reuse the
   existing drawer-close path.
3. Add a focused interaction regression test and update the responsive
   navigation contract.

## Exit Criteria

- A mobile menu link closes the drawer and clears the open state.
- Syntax and focused interaction checks pass.
- The application build is attempted and any environment gap is recorded.
