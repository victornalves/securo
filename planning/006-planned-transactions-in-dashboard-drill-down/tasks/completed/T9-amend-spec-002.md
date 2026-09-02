# T9 — Amend spec 002 so D3 and this spec cannot be read as contradictory

| Field      | Value |
| ---------- | ----- |
| Task       | T9    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Record in spec 002 that its D3 is narrowed to navigable lists, pointing at spec 006. This is an
acceptance criterion of 006, not bookkeeping.

## Implementation guidance

Spec 002 (`planning/002-planned-transactions/spec.md`) states in D3 that the toggle "affects computed
figures only — never which rows appear in a list", and carries the acceptance criteria:

- "The toggle governs **figures only**. Planned transactions remain listed in the transactions view in
  both toggle states…"
- "Turning the toggle off never removes a row from any list, and turning it on never adds one."

Read literally, spec 006 violates the second one. Do **not** delete or rewrite the criteria — 002 is
Done and its history is the record of what was decided when. Instead:

1. Amend the **D3 row** to note the narrowing, e.g. append: *"Narrowed by spec 006: the rule governs
   lists the user navigates to browse (the transactions view). A drill-down that exists only to
   decompose a single computed figure follows the preference, because otherwise it contradicts the
   figure it explains."*
2. Annotate the "never adds one" acceptance criterion the same way 002 annotates its resolved open
   questions — strike through and mark the narrowing, with the pointer to 006.
3. Add a **Revision History** row: version bump (1.1.0 → 1.2.0), date, and the change summary.
4. Leave the `Status: Approved` and the Done row in `planning/README.md` untouched — 002 stays Done.

Keep the wording factual about *why*: the drill-down is reachable only by clicking the figure it
explains and is titled after it, whereas the transactions view is where a user goes to find rows.
That distinction is the whole justification and it should survive in 002's own text.

## Files affected

- `planning/002-planned-transactions/spec.md`

## Done when

Reading 002 and 006 in sequence yields no contradiction, and 002's revision history explains when and
why the narrowing happened.

## Notes

Also worth checking `planning/002-planned-transactions/plan.md` and its completed task files for the
same blanket phrasing; if a task file asserts it, leave the task file alone (it is history) — the spec
is the document people read.
