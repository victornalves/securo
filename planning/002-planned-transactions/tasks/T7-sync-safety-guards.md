# T7 — Sync safety guards

| Field      | Value |
| ---------- | ----- |
| Task       | T7    |
| Feature    | 002   |
| Status     | Todo  |
| Depends on | T2    |
| PR         |       |
| Jira       | —     |

## Description

Prevent provider sync from promoting, overwriting or deleting a planned transaction. Without this,
the existing duplicate matcher silently performs the auto-reconciliation that spec decision D2 rules
out.

## Implementation guidance

`backend/app/services/connection_service.py`. Every path that mutates an existing row must exclude
`status == "planned"`:

- **`_find_synced_duplicate`** (lines 765-837) — the real hazard. Path 2 (lines 814-835) matches on
  same account / date / amount / type where **`Transaction.status != txn_data.status`** (line 827),
  guarded by a ≥0.7 description similarity. Its docstring describes the intent as *"a
  scheduled/pending row replaced by a posted row."* A planned row sitting next to an incoming posted
  one satisfies that predicate exactly, and the caller then upgrades the status and swaps the
  `external_id` (lines 1357-1362) — silently converting the user's planned entry into the synced
  transaction. Add `Transaction.status != "planned"` to the match query.
- **`external_id` upgrade paths** — lines 619-620 and 1311-1312:
  `if existing_tx.status == "pending" and txn_data.status == "posted"`. A planned row has no
  `external_id`, so it should not be reachable here; add the guard anyway rather than relying on that
  invariant holding.
- **Insert paths** — lines 662 and 1435 set `status=txn_data.status`. No change needed; confirm they
  cannot target an existing planned row.

Per the spec: an incoming transaction corresponding to a planned entry results in **two rows**. The
planned one is then surfaced as overdue (T10) for the user to promote or delete. Temporary visible
duplication is the accepted trade-off for not guessing — the alternative is exactly the auto-matching
the spec defers.

Leave the `pending` → `posted` reconciliation untouched. It is provider-driven, it works, and it is a
spec Non-Goal.

## Files affected

- `backend/app/services/connection_service.py`
- `backend/tests/`

## Done when

Satisfies: *"Provider sync never promotes, overwrites, or deletes a planned transaction — including
the duplicate-detection and twin-matcher paths"* and *"An incoming synced transaction that
corresponds to a planned entry results in both rows existing."*

Verified by a regression test that constructs the exact trap: a planned row on an account, then a
sync delivering a posted transaction with the same date, amount, type and a highly similar
description — above the 0.7 threshold, so it *would* match without the guard. Assert the planned row
is untouched (same id, still `planned`, still no `external_id`) and the incoming row was inserted
separately. Confirm the test fails without the guard.

## Notes

Worth checking whether any other service mutates transactions in bulk (rules, imports, bill
regeneration) and would benefit from the same exclusion. If one is found, note it here rather than
widening this task.
