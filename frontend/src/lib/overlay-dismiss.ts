/**
 * Helpers for a hand-rolled dismissible panel that can have Radix overlays
 * stacked on top of it.
 *
 * The problem they solve: a drawer that dismisses on outside-mousedown and on
 * Escape will dismiss itself when the user interacts with a dialog opened from
 * inside it. Radix renders dialogs, dropdowns, popovers and selects into a
 * portal at the end of `<body>`, so every click inside one of them is,
 * literally, outside the panel's DOM subtree — and Escape reaches both
 * listeners. The panel has to recognise that something is layered above it and
 * leave those events alone.
 *
 * Radix stamps `data-slot` on each primitive (see `components/ui/*`) and wraps
 * popper-positioned content in `[data-radix-popper-content-wrapper]`, and it
 * unmounts that content on close — so presence in the DOM is a reliable
 * "an overlay is open" signal.
 *
 * Not unit-tested: `vitest.config.ts` runs the `node` environment, so there is
 * no DOM here. This is DOM glue, kept in one place precisely because it is the
 * kind of thing that is easy to get subtly wrong in each panel that needs it.
 */

/** Portal-rendered layers that sit above a panel. */
const OVERLAY_LAYER_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="dialog-overlay"]',
  '[data-slot="dialog-portal"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-radix-popper-content-wrapper]',
].join(',')

/**
 * Did this event land inside an overlay layered above the panel?
 *
 * Use it to skip an outside-click dismissal: the target is outside the panel's
 * subtree, but it belongs to something the panel itself opened.
 */
export function isInsideOverlayLayer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest(OVERLAY_LAYER_SELECTOR)
}

/**
 * Is any overlay currently open above the panel?
 *
 * Use it to skip an Escape dismissal, so one Escape closes the topmost layer
 * rather than the whole stack at once.
 */
export function hasOpenOverlayLayer(): boolean {
  return !!document.querySelector(OVERLAY_LAYER_SELECTOR)
}
