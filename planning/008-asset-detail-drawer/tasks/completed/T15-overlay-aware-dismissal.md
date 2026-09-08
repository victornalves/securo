# T15 — Don't dismiss the drawer for layers it opened itself

| Field      | Value |
| ---------- | ----- |
| Task       | T15   |
| Feature    | 008   |
| Status     | Done  |
| Depends on | T4    |
| PR         | #13   |
| Jira       |       |

## Description

Opening the transaction dialog from inside the drawer and then closing it closed the drawer too.
Same for Escape: one press dismissed both layers.

## Implementation guidance

The drawer's dismissal handlers were copied from `TransactionDrillDown`: a `mousedown` listener
that closes when the target is not inside `panelRef`, and an Escape listener on `document`.

Radix portals dialogs, dropdowns, popovers and selects to the end of `<body>`. So every click
inside the transaction dialog — its buttons, its date popover, its dim overlay — is genuinely
outside the panel's DOM subtree, and the handler could not tell that apart from a click on the
page behind. Escape, meanwhile, reached Radix and the drawer at once.

## Files affected

- `frontend/src/lib/overlay-dismiss.ts` (new)
- `frontend/src/components/assets/AssetDetailDrawer.tsx`
- `planning/008-asset-detail-drawer/spec.md` (criterion added, v1.1.1)

## Done when

Satisfies the criterion added under *Opening and dismissing* in spec v1.1.1.

## Outcome

`lib/overlay-dismiss.ts` exports `isInsideOverlayLayer(target)` and `hasOpenOverlayLayer()`,
both matching the `data-slot` attributes the repo's `components/ui/*` primitives already stamp
plus `[data-radix-popper-content-wrapper]` for popper-positioned content. Radix unmounts that
content on close, so its presence in the DOM is a sound "an overlay is open" signal.

The drawer now skips an outside-click dismissal when the event lands in such a layer, and skips
an Escape dismissal while one is open — so a single Escape closes the topmost layer rather than
the whole stack.

Deliberately generic rather than a `dialogOpen` prop threaded down from the page: the page knows
about the transaction dialog, but not about the delete confirmation inside `HoldingLedger`, the
date popover inside the dialog, or the external-links dropdown in the drawer's own header — all
of which had the same defect. A flag would have fixed one of four.

Not unit-tested: `vitest.config.ts` runs the `node` environment, so there is no DOM available.
Kept in one file for exactly that reason.

## Notes

**`TransactionDrillDown` has the same defect** and is untouched here. The dashboard opens the
transaction dialog from it (`pages/dashboard.tsx:1337`), and its handlers are the pattern this
one was copied from. It belongs to spec 006, so fixing it is a separate call — the helper is
already shared and generic, so the change there would be two lines.
