# Tasks — Budget report tab

One file per task, named `T<NN>-<slug>.md`. **Open** tasks live in this folder; when a task
is done, set its Status to `Done` and **move the file into `completed/`**. So the open work
is whatever sits directly here, and the history is in `completed/`.

Work tasks in numeric order (T1, T2, …), one at a time.

## Task list

| Task | Title | Depends on |
| ---- | ----- | ---------- |
| T1 | Extract the actual-spending computation into a window helper | — |
| T2 | Aggregate envelopes and actuals over a window | T1 |
| T3 | Budget report response schemas | — |
| T4 | `report_service.get_budget_report`: window resolution and assembly | T2, T3 |
| T5 | `GET /api/reports/budget` | T4 |
| T6 | Backend tests for the budget report | T5 |
| T7 | Frontend types and API client method | T3 |
| T8 | Pure chart helpers and their unit tests | T7 |
| T9 | `BudgetReport` component: summary row and grouped column chart | T8 |
| T10 | Wire the Budget tab into the reports page | T7, T9 |
| T11 | Manual QA and parity check against `/budgets` | T6, T10 |

T3 has no dependency and unblocks both the backend assembly (T4) and the whole frontend chain
(T7 → T8 → T9), so it is worth doing early even though T1/T2 come first in number order.

## Definition of Done

A task counts as done when:

- [ ] Code is merged via a reviewed PR
- [ ] Tests covering the task pass
- [ ] The linked acceptance criteria are satisfied
- [ ] Spec/plan updated if behavior changed
