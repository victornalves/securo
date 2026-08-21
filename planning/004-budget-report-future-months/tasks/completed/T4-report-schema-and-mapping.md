# T4 — Report schema and service mapping

| Field      | Value |
| ---------- | ----- |
| Task       | T4    |
| Feature    | 004   |
| Status     | Done  |
| Depends on | T3    |
| PR         |       |
| Jira       | —     |

## Description

Expose the split through `GET /api/reports/budget`.

## Implementation guidance

`backend/app/schemas/report.py`:

```diff
 class BudgetReportRow(BaseModel):
-    realized: float
+    realized: float          # status != 'planned' only, preference-independent
+    planned: float           # status == 'planned' only, preference-independent
-    difference: float        # budgeted - realized; positive = room left
+    difference: float        # budgeted - (realized + planned); positive = room left
-    percentage_used: float | None
+    percentage_used: float | None   # (realized + planned) / budgeted * 100

 class BudgetReportSummary(BaseModel):
     budgeted: float
     realized: float
+    planned: float
     balance: float                  # budgeted - realized
+    committed_balance: float        # budgeted - realized - planned
     out_of_budget: float
+    out_of_budget_planned: float
```

`difference` and `percentage_used` move to the committed basis (004 plan ADR): the tooltip
recomputes both locally today, so neither field has a consumer and the redefinition is free —
but note it in the field comments so the shift is not silent.

In `report_service.get_budget_report` (`backend/app/services/report_service.py:1614-1690`):

- unpack the third return value from `get_budget_window_totals`;
- keep the sort **by realized descending** as the spec's ordering criterion says — do not
  re-sort on committed;
- per row: `committed = realized + planned`, `difference = budgeted - committed`,
  `percentage_used = round(committed / budgeted * 100, 1) if budgeted > 0 else None`;
- summary: `realized` and `planned` summed over rows (budgeted categories only, unchanged
  scope), `balance = budgeted - realized`, `committed_balance = budgeted - realized - planned`,
  plus both out-of-budget totals.

`BudgetReportMeta` is unchanged — `start_date` already tells the frontend whether the window is
in the future.

No change to `api/reports.py` for this endpoint: `anchor_month` already accepts any valid month
and must keep serving months past the navigation bound.

## Files affected

- `backend/app/schemas/report.py`
- `backend/app/services/report_service.py`

## Done when

Satisfies the **Numbers** criteria for the response shape, and *"An `anchor_month` beyond
`latest_month` is still served by the API"*.

Verified by: an endpoint test on a future anchor month asserting every new field, and one on a
month past the +12 cap returning 200 with envelopes and zero commitments.

## Notes

**Outcome.** As planned. Ordering stays on realized descending. The endpoint test's
`set(payload["summary"])` assertion in `tests/test_budget_report.py` was extended with the three
new keys.
