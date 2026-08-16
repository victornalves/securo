# T11 — Entry control with date-driven default

| Field      | Value |
| ---------- | ----- |
| Task       | T11   |
| Feature    | 002   |
| Status     | Todo  |
| Depends on | T2    |
| PR         |       |
| Jira       | —     |

## Description

Add the planned / realized control to the transaction dialog, with the date-driven default that
spec decision D5 specifies.

## Implementation guidance

`frontend/src/components/transaction-dialog.tsx`. Also update
`frontend/src/types/index.ts:203` — `status: 'posted' | 'pending' | 'planned'`.

**The default rule, exactly as D5 states it.** Three behaviors, each independently testable:

1. **On creation**, the control defaults to planned when the date is in the future, realized
   otherwise.
2. **Once the user sets the control by hand, it stops following the date.** Track a `touched` flag;
   while `touched` is false the control mirrors the date, and once true it never changes on its own.
   Without this the field fights the user — they check planned, adjust the date, and lose their
   choice.
3. **The default applies at creation only.** Editing an existing transaction's date must never flip
   its state. Wire the date-watching effect to the create path exclusively.

**The control is not shown for synced transactions.** Their state is provider-owned
(`pending`/`posted`), and offering a planned/realized choice there would misrepresent what the
control does. Gate on `source === 'sync'` or equivalent.

**The dialog always sends an explicit `status`.** Per the plan's ADR, the backend performs no
date-based inference — it stores what it is given. This is deliberate: server-side inference cannot
express "the user deliberately kept this planned even though the date has passed", which is the
utility-bill case driving the whole feature. The rule lives here and only here.

New i18n strings go in **every** locale file under `frontend/src/locales/` — the repo ships en, de,
pl, ru, uk and others. Follow the existing `transactions.statusPending` / `statusPosted` keys
(`en.json:357-358`) for naming.

## Files affected

- `frontend/src/components/transaction-dialog.tsx`
- `frontend/src/types/index.ts`
- `frontend/src/locales/*.json`

## Done when

Satisfies: *"Manual transaction entry exposes an explicit planned / realized control"*, *"On creation,
that control defaults to planned when the date is in the future and to realized otherwise"*, *"Once
the user sets the control by hand, subsequent date changes within the same entry do not override
their choice"*, *"The date-driven default applies at creation only"*, and *"Synced transactions do not
expose the control."*

Verified by unit tests on the default logic: future date → planned; today and past → realized;
after a manual toggle, changing the date leaves the control alone; opening an existing transaction
and changing its date never alters its status; the control is absent for a synced transaction.

The full entry flow — particularly the sticky-default behavior, which is awkward to assert
automatically — is on the manual QA list in the plan.

## Notes

The `amount` field stays an ordinary editable field. Per D6 there is no estimated-vs-exact flag, no
amount history and no planned-vs-actual variance — the user simply overwrites the value when the real
figure arrives. Do not add a confirmation step or a "was/now" display.
