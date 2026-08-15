# T6 — Frontend: thread `anchorMonth` through the reports API client

| Field      | Value      |
| ---------- | ---------- |
| Task       | T6         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T1, T2, T4 |
| PR         | —          |
| Jira       | —          |

## Description

Add an `anchorMonth` parameter to the three report API client functions and a new `bounds()`
function, so `reports.tsx` (T7) can call them.

## Implementation guidance

From `plan.md` → "Data Model / Contracts":

- `frontend/src/lib/api.ts` (current signatures, lines ~1101-1127):

  ```ts
  netWorth: async (months = 12, interval = 'monthly', accountIds?, assetGroupIds?, period?: 'ytd', anchorMonth?: string) => ...
  incomeExpenses: async (months = 12, interval = 'monthly', accountIds?, period?: 'ytd', days?: number, anchorMonth?: string) => ...
  cashFlow: async (months = 6, interval = 'daily', baseline = false, accountIds?: string[], anchorMonth?: string) => ...
  ```

  When `anchorMonth` is set, include it as a query param (`anchor_month`) in the request; the
  existing `months`/`period`/`days`/`baseline` params can still be sent as-is (the backend ignores
  them when `anchor_month` is present per T1/T2 — no need for the client to omit them).
- Add:

  ```ts
  bounds: async (): Promise<{ earliest_month: string | null }> =>
    (await apiClient.get('/reports/bounds')).data
  ```

  (match whatever the existing `reports.*` functions use for the underlying HTTP client in this
  file — same pattern as `netWorth`/`incomeExpenses`/`cashFlow`.)

## Files affected

- `frontend/src/lib/api.ts`

## Done when

- All three report functions accept the new optional trailing `anchorMonth` param without
  breaking any existing call site (it's optional, existing callers omit it).
- `reports.bounds()` exists and returns the shape defined in `plan.md`'s Data Model section.
- No test suite exists for `api.ts` today — verify manually via T7's integration, or add a
  minimal test if a precedent exists elsewhere in `frontend/src/lib/*.test.ts`.

## Notes

Purely mechanical parameter threading — no new logic, just exposing what T1/T2/T4 added on the
backend.
