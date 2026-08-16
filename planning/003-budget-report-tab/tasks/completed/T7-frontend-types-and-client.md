# T7 — Frontend types and API client method

| Field      | Value |
| ---------- | ----- |
| Task       | T7    |
| Feature    | 003   |
| Status     | Done  |
| Depends on | T3    |
| PR         | 4529a34 (local) |
| Jira       | —     |

## Description

Mirror the response contract in TypeScript and add the client call.

## Implementation guidance

In `frontend/src/types/index.ts`, mirroring T3's schemas:

```ts
export interface BudgetReportRow {
  category_id: string
  category_name: string
  category_icon: string
  category_color: string
  group_name: string | null
  budgeted: number
  realized: number
  difference: number
  percentage_used: number | null
  months_in_window: number
  months_budgeted: number
}

export interface BudgetReportSummary {
  budgeted: number
  realized: number
  balance: number
  out_of_budget: number
}

export interface BudgetReportMeta {
  currency: string
  start_date: string
  end_date: string
  months_in_window: number
  anchor_month: string | null
}

export interface BudgetReportResponse {
  rows: BudgetReportRow[]
  summary: BudgetReportSummary
  meta: BudgetReportMeta
}
```

In `frontend/src/lib/api.ts`, inside the existing `reports` object:

```ts
budget: async (months = 12, period?: 'ytd', anchorMonth?: string): Promise<BudgetReportResponse> => {
  const { data } = await api.get('/reports/budget', { params: { months, period, anchor_month: anchorMonth } })
  return data
},
```

No `acctIdsParam` helper here — this endpoint takes no account filter (T5).

## Files affected

- `frontend/src/types/index.ts`
- `frontend/src/lib/api.ts`

## Done when

`tsc` passes and the method is callable with each parameter combination the tab uses
(`anchorMonth` alone; `months`; `months + period='ytd'`).
