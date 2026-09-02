# T6 — Wire the preference into the drawer's request and cache key

| Field      | Value  |
| ---------- | ------ |
| Task       | T6     |
| Feature    | 006    |
| Status     | Done   |
| Depends on | T2, T4 |
| PR         |        |
| Jira       | —      |

## Description

Send `pnl_include_planned` from the drawer, force it on for the uncategorized worklist, and make the
React Query cache respect the preference.

## Implementation guidance

**API client** — add the parameter to the list params type (`frontend/src/lib/api.ts:444`, beside
`user_pnl_only`):

```ts
    user_pnl_only?: boolean
    pnl_include_planned?: boolean
```

Nothing else in `api.ts` changes; `params` is forwarded as-is.

**Component** (`frontend/src/components/transaction-drill-down.tsx`) — `useAuth` is already imported
and destructured for `user`. Derive the flag:

```ts
  const includePlanned = user?.preferences?.include_planned ?? false
  // Spec 006/D3: the uncategorized drawer explains a status-agnostic worklist
  // count (`pending_categorization` has no status predicate), so it counts
  // planned rows in both preference states. Every other drawer explains a
  // preference-dependent P&L figure and follows the preference.
  const pnlIncludePlanned = filter?.uncategorized ? true : includePlanned
```

Pass it in the list query and put it in the key:

```ts
  const { data, isLoading } = useQuery({
    queryKey: ['drill-down', filter, pnlIncludePlanned],
    queryFn: () =>
      transactionsApi.list({
        ...
        user_pnl_only: true,
        pnl_include_planned: pnlIncludePlanned,
      }),
    enabled: !!filter,
  })
```

**Why the key and not the toggle's invalidation list.** `IncludePlannedToggle` invalidates
`dashboard`, `budgets`, `reports` and `accounts` (`include-planned-toggle.tsx`, `onSuccess`). Adding
`'drill-down'` there would put knowledge of this component inside the toggle and grow a list that is
already a maintenance hazard. The value is genuinely part of the request, so keying on it is
self-maintaining — and it makes toggling back and forth instant rather than a refetch.

Do **not** send `status` — the visibility axis stays untouched (002/D3 holds for the navigable list).

## Files affected

- `frontend/src/lib/api.ts`
- `frontend/src/components/transaction-drill-down.tsx`

## Done when

With the preference on, the category drawer's rows include planned entries and its footer total
matches the chart bar; with it off, contents are unchanged from today. Flipping the toggle and
reopening a drawer shows the new state, never a cached previous one. The uncategorized drawer shows
planned rows in both states.

## Notes

`filter` is already part of the key as an object; React Query serializes it structurally, so adding a
boolean alongside it is consistent with what is there.
