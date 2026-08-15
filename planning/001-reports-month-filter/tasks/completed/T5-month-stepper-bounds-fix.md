# T5 — Frontend: fix `MonthStepper` to forward `minDate`/`maxDate`

| Field      | Value      |
| ---------- | ---------- |
| Task       | T5         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | —          |
| PR         | —          |
| Jira       | —          |

## Description

`MonthStepper` currently accepts no `minDate`/`maxDate` props and doesn't forward any to the
underlying `MonthPicker`, even though `MonthPicker` already supports both (it disables the
prev/next-year buttons and out-of-range month cells). Fix this so callers can actually bound
navigation.

## Implementation guidance

From `plan.md` → "Architecture & Components" and ADR "new `/api/reports/bounds` endpoint":

- `frontend/src/components/month-stepper.tsx`: add `minDate?: Date` and `maxDate?: Date` to
  `MonthStepperProps`, and pass them through to the `<MonthPicker ... />` it renders (currently
  line ~49 omits both).
- `frontend/src/components/ui/monthpicker.tsx` needs no change — it already implements the
  disabling logic (lines ~70, 81, 97-111) once `minDate`/`maxDate` are supplied.
- Also gate the stepper's own prev/next buttons (not just the popover calendar) against
  `minDate`/`maxDate` if they currently step unconditionally — check `month-stepper.tsx`'s
  prev/next handlers and disable them at the bound, matching `MonthPicker`'s behavior.

## Files affected

- `frontend/src/components/month-stepper.tsx`

## Done when

- Satisfies part of spec Acceptance Criteria: "The month selector allows navigating back to the
  month of the workspace's earliest transaction, and no further" — this task provides the
  mechanism; T7 wires the actual `/bounds` value into it.
- Manual check: passing `minDate`/`maxDate` to `MonthStepper` visibly disables navigation past
  those bounds (both the stepper buttons and the popover calendar).
- No behavior change for existing callers that don't pass `minDate`/`maxDate` (e.g.
  `transactions.tsx`) — props are optional and default to no bound.

## Notes

This is a small, isolated bug fix — independent of the backend tasks, can be done in parallel.
