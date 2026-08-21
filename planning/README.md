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
| 002 | Feature | Planned transactions | [spec](002-planned-transactions/spec.md) · [plan](002-planned-transactions/plan.md) · [tasks](002-planned-transactions/tasks/) | 2026-08-15 | — |
| 001 | Feature | Reports month filter | [spec](001-reports-month-filter/spec.md) · [plan](001-reports-month-filter/plan.md) · [tasks](001-reports-month-filter/tasks/) | 2026-07-28 | — |

## Backlog

| ID  | Type | Title | Notes |
| --- | ---- | ----- | ----- |
| 005 | Bug  | Future-dated manual rows stored as posted | Migration 066 (spec 002) scoped itself to `source='recurring'`, deliberately: manual rows had never had a way to express intent. Spec 004 made the consequence visible — 14 instalment rows dated 2026-09 to 2027-03 draw as *Realized* in a future month. Extend the reclassification to future-dated manual and imported rows, reversibly. Victor's own rows were promoted by hand on 2026-08-20; this is the general fix. |
