# T8 — Badges and the footer line

| Field      | Value  |
| ---------- | ------ |
| Task       | T8     |
| Feature    | 006    |
| Status     | Done   |
| Depends on | T6, T7 |
| PR         |        |
| Jira       | —      |

## Description

Make planned rows, recurring projections and realized rows visually distinct, and disclose the
planned portion in the footer without splitting the total.

## Implementation guidance

In `frontend/src/components/transaction-drill-down.tsx`:

**Badges.** The drawer currently draws projections with a violet pill labelled
`transactions.recurringBadge`. Violet is the transactions view's colour for `status === 'planned'`
(`frontend/src/pages/transactions.tsx:993`), so adding planned rows under the current styling would
put two different concepts in one colour. Align both with the transactions view:

- `kind === 'planned'` → the violet pill with `t('transactions.plannedBadge')` and
  `title={t('transactions.plannedHint')}`, copying the classes from `transactions.tsx:993-999`
  (`text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/20 border border-violet-200 dark:border-violet-500/30`).
- `kind === 'projected'` → keep `t('transactions.recurringBadge')` but move to the primary-tinted
  pill the transactions view uses for recurring-linked rows
  (`text-primary bg-primary/5 border border-primary/10`).

This changes the projection badge's appearance for users who never enable the preference. That is
deliberate and recorded in the plan: it was borrowing the planned colour before planned existed as a
visible state here.

**Clickability.** Planned rows are real transactions, so they must open the transaction dialog like
realized ones — which they already do once the click guard reads `kind === 'projected'` (T4).
Projections stay non-clickable. No new affordance for promotion: the planned/realized control already
lives in the dialog.

**Footer.** Keep exactly one total. It needs no arithmetic change — it already sums whatever is in the
list, so it starts matching the chart the moment planned rows arrive. Add the secondary line below the
existing count/total row, rendered only when `plannedCount > 0`:

```tsx
{plannedCount > 0 && (
  <p className="text-[11px] text-muted-foreground mt-1">
    {t('dashboard.drillDownPlannedNote', {
      count: plannedCount,
      total: mask(formatCurrency(plannedTotal, userCurrency, locale)),
    })}
  </p>
)}
```

`plannedCount` and `plannedTotal` come from `summarizeDrillDown` (T4). Wrap the amount in `mask` —
privacy mode must apply to it exactly as it does to every other figure in this drawer.

**Rejected, do not implement:** two headline figures (realized and planned side by side). Neither
would equal the chart, which is the problem this spec exists to fix.

## Files affected

- `frontend/src/components/transaction-drill-down.tsx`

## Done when

A drawer containing planned rows shows the violet Planned badge on them, the primary-tinted Recurring
badge on projections, one total equal to the chart figure, and the "includes N planned" line. Clicking
a planned row opens the transaction dialog; clicking a projection does nothing.

## Notes

**Deviation from the guidance:** the projection badge ships with no `title`. The plan suggested reusing `transactions.recurringLinkedTooltip`, but it reads "Linked to a recurring bill" — that describes a stored row pointing at a rule, which a projection is not (it has no row yet). Mislabelling it would be worse than having no tooltip, and inventing a tenth locale key for a hover string was not worth reopening T7.

Check both themes — the violet classes carry explicit `dark:` variants in `transactions.tsx` and both
halves must be copied, not just the light one.
