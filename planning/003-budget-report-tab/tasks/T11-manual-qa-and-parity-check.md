# T11 — Manual QA and parity check against `/budgets`

| Field      | Value    |
| ---------- | -------- |
| Task       | T11         |
| Feature    | 003         |
| Status     | In Progress |
| Depends on | T6, T10  |
| PR         | —        |
| Jira       | —        |

## Description

Verify the acceptance criteria that automated tests cannot reach — rendering, interaction, and
the end-to-end agreement between this tab and `/budgets` on real workspace data.

## Implementation guidance

Run the app locally against a workspace that has budgets. Walk the checklist below; anything
that fails is either a bug to fix in the owning task or a spec/plan correction — not something
to note and move past.

**Parity (the criterion the whole design exists for)**

- [x] **Verified against the real local database, 2026-08-15.** A script ran
      `get_budget_vs_actual` and `get_budget_report` over the same workspace and month and
      compared them category by category: 16 of 16 budgeted categories matched on both
      envelope and realized, to the cent. Zero-spend budgeted categories (Moradia, Lazer,
      Educação, Compras, Hobby, Casa) came through with a zero realized bar as designed.
      A 6M window resolved to 2026-02-01 → 2026-08-16 — **seven** calendar months, confirming
      in practice why the month list must follow the resolved start date rather than the
      requested count.
- [ ] The tab's *Budget Balance* equals the dashboard's Budget Balance metric for the current
      month (checked at service level; still worth one look in the UI).

**Period filters**

- [ ] Stepping the month arrows re-renders the chart for the new month.
- [ ] Range mode with 6M/YTD/1Y/2Y renders, and totals grow monotonically as the window widens.
- [ ] Entering the tab fresh (no `?mode` in URL) lands in Month mode; explicitly choosing Range
      and re-entering the tab keeps Range.
- [ ] Browser back/forward steps through mode/month changes without duplicate history entries.
- [ ] The interval selector is not visible on this tab.

**Chart**

- [ ] A workspace with 20+ budgeted categories scrolls horizontally with every label readable —
      none dropped, none overlapping.
- [ ] Over-budget categories are visually distinct without comparing bar heights.
- [ ] The out-of-budget column is last even when it is the tallest.
- [ ] A budgeted category with no spending shows with a zero-height realized bar.
- [ ] Tooltip shows budgeted, realized, difference and % used; the coverage line appears only
      for partially covered categories (test with a category budgeted mid-window in a 1Y range).

**States and cross-cutting**

- [ ] Empty state on a workspace with no budgets (not the generic "no data").
- [ ] Privacy mode masks summary, axis ticks and tooltip.
- [ ] With a Collection active, the notice replaces the chart and no request is issued.
- [ ] The other four tabs are unchanged — spot-check Net Worth and Money Map in both modes.

**Regression**

- [ ] `/budgets` and the dashboard render identical numbers to before the T1 refactor (compare
      against `main` if in doubt).

## Files affected

- None (verification only). Fixes land in the task that owns the code.

## Done when

Every box above is checked, or the failure is captured as a follow-up item with an owner.

## Notes

**Status: the automated half is done, the browser half is not.** What has been verified
without a browser, as of 2026-08-15:

- Real-data parity against `/budgets` (see the checked box above).
- 2377 backend tests pass, 7 skipped, with `test_budget_service.py`, `test_budgets_api.py`,
  `test_report_service.py` and `test_report_service_coverage.py` **unmodified** — the T1
  refactor guard held.
- 51 frontend tests pass, including the 11 new chart-helper cases and the 33 i18n parity
  checks across the nine locales.
- `tsc --noEmit` and eslint clean; the dev server serves the page with no build error.

What still needs a human at the screen: everything under **Period filters**, **Chart**, and
**States and cross-cutting** above — month stepping, the Range/Month default, back/forward
history, privacy masking, the 20+ category scroll, the empty state, and the Collection notice.
