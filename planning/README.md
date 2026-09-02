# Planning Index

This directory holds every specification for this repository, following the spec-driven
workflow. Each item lives in `planning/NNN-slug/` with `spec.md` (what & why), `plan.md`
(how), and `tasks/` (breakdown & status). Sync targets (Confluence space, Jira project)
are configured in [`config.yml`](config.yml).

Keep the three tables below current. An item moves Backlog → In Progress (spec approved and
work started) → Done (all tasks complete).

## In Progress

| ID  | Type | Title | Docs | Owner | Jira |
| --- | ---- | ----- | ---- | ----- | ---- |
| 004 | Feature | Budget report future months | [spec](004-budget-report-future-months/spec.md) · [plan](004-budget-report-future-months/plan.md) · [tasks](004-budget-report-future-months/tasks/) | Victor Alves | — |
| 003 | Feature | Budget report tab | [spec](003-budget-report-tab/spec.md) · [plan](003-budget-report-tab/plan.md) · [tasks](003-budget-report-tab/tasks/) | Victor Alves | — |

## Done

| ID  | Type | Title | Docs | Completed | Jira |
| --- | ---- | ----- | ---- | --------- | ---- |
| 006 | Feature | Planned transactions in dashboard drill-down | [spec](006-planned-transactions-in-dashboard-drill-down/spec.md) · [plan](006-planned-transactions-in-dashboard-drill-down/plan.md) · [tasks](006-planned-transactions-in-dashboard-drill-down/tasks/) | 2026-09-01 | — |
| 002 | Feature | Planned transactions | [spec](002-planned-transactions/spec.md) · [plan](002-planned-transactions/plan.md) · [tasks](002-planned-transactions/tasks/) | 2026-08-15 | — |
| 001 | Feature | Reports month filter | [spec](001-reports-month-filter/spec.md) · [plan](001-reports-month-filter/plan.md) · [tasks](001-reports-month-filter/tasks/) | 2026-07-28 | — |

## Backlog

| ID  | Type | Title | Notes |
| --- | ---- | ----- | ----- |
| 007 | Bug  | Uncategorized badge count diverges from its drawer | `pending_categorization` (dashboard_service.py) counts every uncategorized row, while the drawer it opens filters through `counts_as_user_pnl`, which drops rows in closed accounts and rows excluded by `is_ignored` on the transaction or its category. The badge therefore promises more rows than the worklist delivers, in both include-planned states. Split out of spec 006, which fixes only the planned-state half of the divergence. |
| 005 | Bug  | Future-dated manual rows stored as posted | Migration 066 (spec 002) scoped itself to `source='recurring'`, deliberately: manual rows had never had a way to express intent. Spec 004 made the consequence visible — 14 instalment rows dated 2026-09 to 2027-03 draw as *Realized* in a future month. Extend the reclassification to future-dated manual and imported rows, reversibly. Victor's own 14 rows are still `posted` as of 2026-08-21 — promoting them needs a write to the live database. This item is the general fix. |
