# T7 — Frontend: Range/Month toggle on `/reports` (all four tabs)

| Field      | Value      |
| ---------- | ---------- |
| Task       | T7         |
| Feature    | 001        |
| Status     | Done       | <!-- Todo | In Progress | Done -->
| Depends on | T5, T6     |
| PR         | —          |
| Jira       | —          |

## Description

Add the segmented Range/Month toggle to `reports.tsx`. Selecting Month renders `MonthStepper`
(bounded by `/reports/bounds`) instead of the rolling-window preset buttons, on all four tabs
(net worth, income & expenses, cash flow, money map — per spec v0.4.0). Both the selected preset
and the selected month persist independently across tab switches, and the whole thing is
URL-synced.

## Implementation guidance

From `plan.md` → "Architecture & Components" and ADR "Range/Month is a single segmented toggle;
both selections persist independently per tab switch":

- Add state to `reports.tsx`:

  ```ts
  const [mode, setMode] = useState<'range' | 'month'>(searchParams.get('mode') === 'month' ? 'month' : 'range')
  const [month, setMonth] = useState<string>(searchParams.get('month') ?? currentMonth())
  ```

  Sync both to the URL (`?mode=month&month=2026-03`) the same way `transactions.tsx` syncs
  `from`/`to` and `dashboard.tsx` syncs `?month=` — `reports.tsx` currently has **zero**
  `useSearchParams` usage, so this is new for this page.
- Fetch bounds once at the page level: `const { data: bounds } = useQuery({ queryKey: ['reports','bounds'], queryFn: reports.bounds })`.
- Render a segmented control (Range | Month) near the existing preset buttons (lines ~502-516).
  When `mode === 'month'`, render `<MonthStepper value={month} onChange={setMonth} minDate={bounds?.earliest_month ? parseMonth(bounds.earliest_month) : undefined} maxDate={new Date()} />`
  instead of the preset buttons, on all four tabs — including Money Map (`isMoneyMap`), which
  today only gets `MONEY_MAP_RANGE_OPTIONS` (lines ~69-92) and no interval toggle; that stays true
  in month mode too, only the date window source changes.
- Wire `anchorMonth` into the existing `useQuery` (lines ~199-208): when `mode === 'month'`, call
  `reports.netWorth(...args, undefined, month)` / etc. with `month` as the trailing `anchorMonth`
  arg from T6, instead of the `months`/`period`/`days` args.
- **Do not** let the existing tab-switch clamp (`handleSelectTab`, lines ~179-197) reset `mode` or
  `month` — it should keep clamping `rangeKey`/`interval` to the new tab's valid option set exactly
  as it does today, and leave `mode`/`month` untouched.

## Files affected

- `frontend/src/pages/reports.tsx`

## Done when

- Satisfies spec Acceptance Criteria: month selector present on all four tabs; switching
  Range↔Month is one obvious action; switching tabs doesn't lose the previously selected preset
  or month; existing rolling-window presets work exactly as before.
- Manual QA: select a month on one tab, switch tabs, switch back — month selection is preserved;
  same for a preset. Reload the page with `?mode=month&month=2026-03` in the URL — state restores
  correctly. Browser back/forward works.
- A month with no data shows the existing empty/no-data state (backend already handles this per
  T1/T2; this task just confirms the frontend doesn't special-case it into an error).

## Notes

This is the largest frontend task — if it turns out too large to review as one PR, consider
splitting URL-sync/state (no UI change) from the toggle UI itself, but keep both landing before
T8/T9 since they depend on `mode`/`month` existing.
