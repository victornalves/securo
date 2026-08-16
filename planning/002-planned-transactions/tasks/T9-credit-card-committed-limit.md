# T9 — Credit-card committed limit

| Field      | Value  |
| ---------- | ------ |
| Task       | T9     |
| Feature    | 002    |
| Status     | Todo   |
| Depends on | T2, T3 |
| PR         |        |
| Jira       | —      |

## Description

Make planned credit-card purchases consume committed limit, and expose committed credit separately
from credit already drawn.

## Implementation guidance

**Bill assignment comes free.** `apply_effective_date` (`credit_card_service.py:69-100`) is already
called from every create/update path, including `create_transaction` at
`transaction_service.py:709`. A planned credit-card row therefore lands in the correct cycle by the
existing three-tier resolution — manual `effective_bill_date` override, then bank-truth
`bill_due_date`, then cycle math via `compute_effective_date` with the Brazilian convention that a
purchase *on* the close day belongs to the next invoice. **Write no new date logic.** Verify the
behavior with tests; do not reimplement it.

**New computation** — `backend/app/services/credit_card_service.py`, alongside the existing
`compute_available_credit(credit_limit, current_balance)` at line 58:

```python
def compute_committed_credit(
    credit_limit: Optional[Decimal],
    current_balance: Decimal,
    planned_total: Decimal,
) -> Optional[Decimal]:
    """available_credit minus planned purchases not yet drawn."""
```

Return `None` when `credit_limit` is `None`, matching `compute_available_credit`'s contract. Note
that a credit card's `current_balance` is **negative when in debt** (see that function's comment) —
get the sign right.

`planned_total` sums planned debits on the account **regardless of date**. Per the spec: a future
instalment of an already-made purchase is committed today, not when its date arrives. This is the
one place where planned amounts are counted without any date window.

**Exposure** — `AccountRead` (`backend/app/schemas/account.py`) already carries `credit_limit`,
`available_credit`, `statement_close_day`, `payment_due_day`, `next_close_date`, `next_due_date`,
`minimum_payment`. Add:

```
committed_credit: Optional[Decimal]   # limit − (drawn + planned)
planned_amount:   Optional[Decimal]   # planned purchases not yet drawn
```

Keep `available_credit` as it is — it answers "what has the bank drawn?", which is still a question
worth answering. The two coexist.

**Closed bills must not move.** A planned row must not alter a closed bill's `total_amount` or
`minimum_payment`. The existing carve-outs at `transaction_service.py:315-320` and
`account_service.py:712-717` test `status == "pending"` explicitly, so planned does not match them —
verify this holds rather than assuming.

## Files affected

- `backend/app/services/credit_card_service.py`
- `backend/app/services/account_service.py`
- `backend/app/schemas/account.py`
- `backend/app/api/accounts.py`
- `backend/tests/`

## Done when

Satisfies: *"Committed credit limit accounts for planned purchases, and the UI distinguishes credit
committed from credit already drawn"*, *"A planned credit-card purchase consumes committed limit from
the moment it is recorded, not when its date arrives"*, *"Future bill totals include planned purchases
assigned to that cycle"*, and *"Planned transactions do not alter a closed bill's total or its
minimum_payment."*

Verified by unit tests on `compute_committed_credit` (null limit, zero planned, planned exceeding
limit, positive balance) and integration tests: a planned purchase dated three months out reduces
committed credit immediately; it lands in the correct future bill including the close-day edge case
(a purchase exactly on the close day belongs to the next invoice); a closed bill's total and minimum
payment are byte-identical before and after adding a planned row to that period.

## Notes

Frontend display is T13.
