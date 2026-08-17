# T2 — Make `status` settable on create and update

| Field      | Value |
| ---------- | ----- |
| Task       | T2    |
| Feature    | 002   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Introduce `planned` as a third value of `Transaction.status` and let clients set it when creating or
updating a transaction. No aggregate behavior changes in this task — planned rows simply become
representable.

## Implementation guidance

**No schema migration.** `Transaction.status` is `String(10)` with `server_default="posted"` and no
CHECK constraint or enum type (`backend/app/models/transaction.py:45`, migration
`011_transaction_status_payee_rawdata.py:23`). `planned` is 7 characters and fits. Validation lives at
the Pydantic edge, matching how `type` and `source` are already handled.

**Schemas** — `backend/app/schemas/transaction.py`. Neither `TransactionCreate` (line 27) nor
`TransactionUpdate` (line 39) currently has a `status` field at all:

```python
class TransactionCreate(TransactionBase):
    ...
    status: Literal["posted", "planned"] = "posted"

class TransactionUpdate(BaseModel):
    ...
    status: Optional[Literal["posted", "planned"]] = None
```

`pending` is deliberately **not** client-settable — it is provider-owned. Defaulting create to
`posted` preserves current API behavior for any client that omits the field.

**Service** — `backend/app/services/transaction_service.py`. `create_transaction` (line 664) builds
the `Transaction(...)` at line 692 without passing `status`, so it silently inherits the column
default. Pass `status=data.status`. In `update_transaction` (line 1113), apply `data.status` when
provided, following the existing pattern for optional fields.

Per the plan's ADR *"the date-driven default is computed client-side and sent explicitly"*: the
backend performs **no** date-based inference. It stores what it is given. The date→planned default is
UI behavior (T11) because "the user deliberately kept this planned even though the date passed" — the
utility-bill case — cannot be expressed by a server-side rule.

Promotion is an ordinary update setting `status` to `posted`; it must preserve id, category, payee,
notes, tags, attachments, splits and instalment metadata, which it does for free by going through the
existing update path. Verify rather than assume.

## Files affected

- `backend/app/schemas/transaction.py`
- `backend/app/services/transaction_service.py`
- `backend/tests/`

## Done when

Satisfies: *"A transaction can be created and edited in a `planned` state on both checking and
credit-card accounts, with a date in the past, present, or future"* and *"A transaction can be moved
between `planned` and realized states without changing its ID, category, payee, notes, tags,
attachments, split, or installment metadata."*

Verified by: create with `status="planned"` on a checking account and on a credit-card account, with
past, today and future dates; round-trip through `TransactionRead`; promote to `posted` and assert
every listed field is unchanged; reject `status="pending"` from a client with a validation error;
omitting `status` still yields `posted`.

## Notes

`TransactionRead` already exposes `status` (line 69) — no change needed there.

**Outcome.** No migration needed, as planned. `update_transaction` picks `status` up for free through
its generic `setattr` loop over `model_dump(exclude_unset=True)`, so only `create_transaction` needed
an explicit assignment.

Nine tests in `tests/test_transaction_service.py`: default stays `posted`; planned settable at past,
today and future dates (parametrized — proves no date inference); planned on a credit card still gets
its cycle assigned via the existing `apply_effective_date` (10 March → 28 March bill, close day 20);
promotion preserves id, category, notes, amount and instalment metadata; demotion works; an unrelated
edit does not reset status (the `exclude_unset` trap); `status="pending"` rejected on both schemas.

Full suite green — 2389 passed, 7 skipped. Ruff clean across `app/` and `tests/`.

Status is deliberately **not** added to `cascade_fields` for transfer pairs — planned transfers are a
spec Non-Goal.
