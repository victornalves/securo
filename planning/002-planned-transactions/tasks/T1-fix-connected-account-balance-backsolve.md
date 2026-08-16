# T1 — Fix connected-account balance back-solve

| Field      | Value |
| ---------- | ----- |
| Task       | T1    |
| Feature    | 002   |
| Status     | Todo  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Fix the unbounded delta window in `_account_balance_at` that lets future-dated transactions distort a
connected account's current balance. This is a pre-existing defect, independent of planned
transactions — it ships on its own and has a test that fails on `main`.

## Implementation guidance

`backend/app/services/dashboard_service.py:869-905`. The connected-account branch back-solves:

```python
current_bal = float(account.balance)          # provider's authoritative CURRENT balance
if account.type == "credit_card":
    current_bal = -current_bal
delta_after = await session.scalar(
    select(func.coalesce(func.sum(_signed_balance_expr(account.currency)), 0))
    .where(
        Transaction.account_id == account.id,
        Transaction.date > cutoff,            # ← no upper bound
        Transaction.is_ignored == False,
    )
)
return current_bal - float(delta_after or 0)
```

`_signed_balance_expr` yields `+amount` for credit and `−amount` for debit. A future debit of 500
contributes `−500`, so `current_bal − (−500)` **inflates** the balance by 500.

The provider balance describes *today*. The back-solve must therefore only walk back over
transactions between the cutoff and today:

```python
Transaction.date > cutoff,
Transaction.date <= date.today(),
```

With a cutoff at or after today the delta window is empty and the function returns the provider
balance unchanged — the correct settled balance. Future days are the projection layer's concern, not
this function's.

Leave the manual-account branch (line 897-905, `Transaction.date <= cutoff`) alone; it is already
correct.

Do **not** add a status filter here — that arrives in T6, which reworks this same expression once
`counts_as_realized()` exists. Keep this task to the date bound so the fix is reviewable in
isolation.

## Files affected

- `backend/app/services/dashboard_service.py`
- `backend/tests/` — new regression test

## Done when

Satisfies the spec criterion *"An account's settled balance never includes planned transactions, in
either toggle state"* in its date dimension, and the plan's balance-correctness concern.

Verified by: a connected account with a provider balance and a future-dated debit reports today's
balance equal to the provider balance. The test must fail on `main` before the fix — confirm this,
otherwise the test is not exercising the defect.

Also assert: a manual account with the same data is unaffected, and a past-dated transaction between
cutoff and today is still subtracted as before.

## Notes

Balances will change for any user holding future-dated rows on connected accounts. It is a
correction, but it will read as a regression to anyone who adapted to the wrong number — flag it for
the release note.
