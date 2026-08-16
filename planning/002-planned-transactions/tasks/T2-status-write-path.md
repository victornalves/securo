# T2 — Make `status` settable on create and update

| Field      | Value |
| ---------- | ----- |
| Task       | T2    |
| Feature    | 002   |
| Status     | Todo  |
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
