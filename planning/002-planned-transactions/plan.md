# Plan: Planned transactions

| Field        | Value        |
| ------------ | ------------ |
| ID           | 002          |
| Status       | Approved     |
| Version      | 1.0.0        |
| Spec         | ./spec.md    |
| Author       | Victor Alves |
| Last updated | 2026-08-15   |

## Solution Overview

`planned` becomes a third value of the existing `Transaction.status` column, joining `pending` and
`posted`. Nothing new is introduced at the entity level: a planned transaction is an ordinary
transaction that has not happened yet, so it already carries a category, an account, a bill link,
instalment metadata and splits.

The work splits into four independent concerns:

1. **Write path** — `status` becomes settable on create and update, defaulting from the date at
   creation. Sync paths are locked so a provider can never touch a planned row.
2. **Read path** — a single shared predicate decides whether planned rows enter an aggregate, driven
   by one user preference. Every aggregation site consumes the predicate; none rolls its own.
3. **Balance correctness** — `_account_balance_at` has a pre-existing defect (below) that this
   feature would amplify. It is fixed as part of the same change.
4. **Surfaces** — entry control, list filter, visual distinction, overdue-planned view, and
   credit-card committed limit.

The guiding constraint from the spec is that the toggle governs **figures, never list membership**.
That keeps the two concerns in different layers: the toggle lives in the aggregation predicate and
never reaches a list query, whose visibility is controlled by an explicit `status` filter parameter.

## Architecture & Components

```
                       User.preferences["include_planned"]
                                    │
                                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │ _query_filters.py                                        │
  │   counts_as_realized()          ← always excludes planned │
  │   counts_as_pnl(include_planned=False)   ← toggle-aware   │
  │   counts_as_user_pnl(include_planned=False)               │
  └──────────────────────────────────────────────────────────┘
        │              │                │              │
        ▼              ▼                ▼              ▼
  dashboard_svc   budget_svc      report_svc     account_svc
   (totals,        (actuals)      (cash flow)     (per-account
    by-category,                                   stats,
    balance hist)                                  committed limit)

  ── list path, toggle NEVER applied ────────────────────────
  transaction_service.list  ←  status filter param  ←  API ?status=
```

**Backend files touched**

| File | Change |
| ---- | ------ |
| `app/models/transaction.py` | Document the third status value; no column change (already `String(10)`). |
| `app/services/_query_filters.py` | New `counts_as_realized()`; add `include_planned` parameter to `counts_as_pnl` / `counts_as_user_pnl` and the four split-offset helpers. |
| `app/schemas/transaction.py` | `status` on `TransactionCreate` and `TransactionUpdate`; `status` filter on the list query. |
| `app/services/transaction_service.py` | Set `status` on create (line 692 block) and update; status filter in list; keep the existing closed-bill carve-out working with three values. |
| `app/services/dashboard_service.py` | Fix `_account_balance_at`; make `_daily_deltas` status-aware; thread `include_planned` through totals, by-category and trends. |
| `app/services/budget_service.py` | Thread `include_planned` into actuals. |
| `app/services/report_service.py` | Thread `include_planned` into cash flow; ensure planned is not double-counted against recurring projections. |
| `app/services/account_service.py` | Per-account stats; committed-limit computation. |
| `app/services/credit_card_service.py` | New `compute_committed_credit(...)` alongside `compute_available_credit`. |
| `app/services/connection_service.py` | Guard every sync write path against planned rows. |
| `app/services/recurring_transaction_service.py` | `generate_pending` writes future occurrences as `planned`. |
| `app/api/transactions.py` | `status` query parameter; overdue-planned endpoint. |
| `app/api/accounts.py` | Expose committed credit on `AccountRead`. |
| `alembic/versions/0NN_*.py` | Reclassify future-dated recurring placeholders. |

**Frontend files touched**

| File | Change |
| ---- | ------ |
| `components/transaction-dialog.tsx` | Planned/realized control with date-driven default. |
| `components/transactions-filter-bar.tsx` | Status filter. |
| `components/transactions-grid-columns.tsx` | `status` column → `defaultVisible: true`. |
| `pages/transactions.tsx` | Planned badge; promote action; status cell as a badge rather than grey text. |
| `pages/dashboard.tsx` | Toggle control; "figures include planned" indicator; overdue-planned entry point. |
| `pages/account-detail.tsx` | Committed vs. drawn credit display. |
| `types/index.ts` | `status: 'posted' | 'pending' | 'planned'`. |
| `locales/*.json` | New strings in every shipped locale. |

## Technical Decisions (mini-ADRs)

### Decision: extend `status` rather than add a column

- **Context:** The spec locks D1 (third status value). The column is `String(10)` with a
  `server_default` of `"posted"` and no CHECK constraint or enum type, so `planned` (7 chars) fits
  without a schema change.
- **Decision:** No migration for the column itself. Validation of allowed values lives in the Pydantic
  schema, matching how `type` (`debit`/`credit`) and `source` are already handled — both are plain
  strings validated at the edge.
- **Alternatives considered:** A native Postgres enum would give database-level safety but requires a
  migration, breaks the SQLite test path, and is inconsistent with every other status-like column in
  this codebase.
- **Consequences:** A bad value can reach the database through a direct write. Acceptable — it is the
  existing convention, and the reclassification migration is the only bulk writer.

### Decision: one shared predicate, `include_planned` threaded explicitly

- **Context:** `_query_filters` already centralizes "what counts", and its docstring states the
  intent: *"Changes to the rule only need to be made here."* But `status` is currently absent from
  every aggregate, so this is the first time the file has to know about it. Meanwhile the closed-bill
  carve-outs in `transaction_service.py:315-320` and `account_service.py:712-717` read `status`
  directly and must keep working.
- **Decision:** Add `counts_as_realized()` (always excludes planned; used by balance and anything
  describing what already happened) and give `counts_as_pnl` / `counts_as_user_pnl` an
  `include_planned: bool = False` parameter. The default is the safe one, so any call site not yet
  updated keeps excluding planned.
- **Alternatives considered:** Reading the preference inside `_query_filters` via a session lookup —
  rejected, it would make pure filter builders do I/O and hide the dependency. A global context
  variable — rejected as implicit and hostile to testing.
- **Consequences:** Every aggregating call site must pass the flag, which is more plumbing but makes
  each site's intent explicit and greppable.

### Decision: fix the connected-account balance back-solve in this change

- **Context:** The spec flagged this as unverified. It is confirmed. `_account_balance_at`
  (`dashboard_service.py:878-893`) back-solves a connected account's balance as
  `provider_balance − Σ(signed deltas where date > cutoff)`, with **no upper date bound**. A future
  debit of 500 contributes `signed = −500`, so the result is `provider_balance + 500` — today's
  balance is inflated by every future-dated debit. The manual-account branch (line 901,
  `date <= cutoff`) is correct.
- **Decision:** Bound the delta window to `cutoff < date <= today` and exclude planned rows via
  `counts_as_realized()`. For a cutoff at or after today the delta becomes empty and the function
  returns the provider balance unchanged, which is the correct settled balance; future days are the
  projection layer's job.
- **Alternatives considered:** Splitting this into its own Bug spec — rejected because the two
  changes touch the same expression, and shipping planned transactions on top of a known-broken
  balance would produce wrong numbers on day one. Recorded here rather than silently folded in.
- **Consequences:** Balances on connected accounts will change for any user who has future-dated
  rows today. That is a correction, but it will look like a regression to anyone who had adapted to
  the wrong figure, so it needs a release note.

### Decision: sync never writes to a planned row

- **Context:** `connection_service` has several paths that mutate existing rows: `external_id`
  matching (lines 1311-1312), the pending→posted upgrade, and `_find_synced_duplicate`
  (765-837), whose Path 2 matches on account/date/amount/type where `status != incoming status`.
  That predicate would match a planned row against an incoming posted one and silently overwrite it.
- **Decision:** Exclude `status == "planned"` from every sync-side match and update query. An
  incoming transaction that corresponds to a planned entry results in two rows; the planned one is
  surfaced as overdue for the user to resolve.
- **Alternatives considered:** Letting the twin-matcher promote planned rows automatically — this is
  exactly the auto-matching the spec puts in Non-Goals (D2), and doing it here by accident would be
  worse than doing it deliberately later.
- **Consequences:** Temporary visible duplication between the real transaction arriving and the user
  promoting or deleting the planned one. The overdue-planned surface exists precisely to make that
  state short-lived and noticeable.

### Decision: the toggle lives in `User.preferences`

- **Context:** A per-user boolean is needed. `User.preferences` is an untyped JSON column already
  holding `language`, `date_format`, `timezone`, `currency_display`, and is exposed through
  `UserRead` / `UserUpdate`. The comparable `credit_card_accounting_mode` lives in `AppSetting`, but
  that is a global admin setting — the wrong scope here.
- **Decision:** `preferences["include_planned"]`, defaulting to `false` when absent. No migration.
  Writes follow the copy-then-assign pattern at `app/api/workspaces.py:148-150`, required because
  SQLAlchemy does not track in-place mutation of a JSON dict.
- **Alternatives considered:** A dedicated column — rejected as a migration for one boolean when a
  preferences bag already exists. `AppSetting` — wrong scope, it is global and admin-managed.
- **Consequences:** No database-level typing or default. Reads must tolerate a missing key, and the
  default must be `False` so absence means "exclude planned".

### Decision: the date-driven default is computed client-side and sent explicitly

- **Context:** D5 requires the control to default from the date at creation, stop following the date
  once touched, and never re-derive on edit. "Touched" is UI state the backend cannot see.
- **Decision:** The dialog owns the default and always sends an explicit `status`. The backend
  applies no date-based inference — it stores what it is given, falling back to `posted` when the
  field is absent, which preserves current API behavior for existing clients.
- **Alternatives considered:** Inferring server-side from the date — rejected because it cannot
  express "the user deliberately kept this planned even though the date has passed", which is the
  utility-bill case from the spec.
- **Consequences:** The rule is duplicated if another client is ever written. Acceptable: the
  alternative loses a required behavior.

## Data Model / Contracts

**No schema migration for `status`.** `String(10)`, `server_default="posted"`, no constraint.

**API additions**

```
# Create / Update
TransactionCreate.status: Literal["posted", "planned"] = "posted"
TransactionUpdate.status: Optional[Literal["posted", "planned"]] = None
# "pending" is provider-owned and not settable by a client.

# List filter — visibility only, never affected by the toggle
GET /transactions?status=planned|pending|posted   (repeatable; omitted = all)

# Overdue planned
GET /transactions/planned/overdue → { count: int, items: [TransactionRead] }
# status == "planned" AND date < today

# Preference
PATCH /users/me  { "preferences": { "include_planned": true } }

# Credit card, on AccountRead
committed_credit: Optional[Decimal]   # limit − (drawn + planned)
planned_amount:   Optional[Decimal]   # planned purchases not yet drawn
```

**Filter contract**

```python
def counts_as_realized():
    """Excludes planned. For balances and anything describing what happened."""
    return and_(counts_as_pnl(), Transaction.status != "planned")

def counts_as_pnl(include_planned: bool = False): ...
def counts_as_user_pnl(include_planned: bool = False): ...
```

**Credit card**

```python
def compute_committed_credit(
    credit_limit: Optional[Decimal],
    current_balance: Decimal,
    planned_total: Decimal,
) -> Optional[Decimal]:
    """available_credit minus planned purchases not yet drawn."""
```

`planned_total` sums planned debits on the account regardless of date — per the spec, a future
instalment is committed at entry, not at its date.

**Migration** — reclassify recurring placeholders

```sql
UPDATE transactions
   SET status = 'planned'
 WHERE source = 'recurring'
   AND date > CURRENT_DATE
   AND status = 'posted';
```

Downgrade reverses it on the same predicate. The migration logs the affected row count. Scoped to
`source = 'recurring'` so manually entered future rows are left alone — the user cannot be assumed
to have meant them as planned.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| An aggregation site is missed and silently counts planned as realized | High | High | Inventory every `counts_as_pnl` / `counts_as_user_pnl` caller and every raw `Transaction.date` aggregate before starting; assert coverage with a test that seeds one planned row and checks each endpoint in both toggle states. |
| Balance fix changes existing users' numbers | Certain, where future rows exist | Medium | Isolate in its own task with its own tests; call it out in the release note as a correction. |
| Sync overwrites or promotes a planned row | Medium | High | Exclude planned in every sync match/update query; regression test driving `_find_synced_duplicate` with a planned twin. |
| Toggle leaks into list queries, contradicting D3 | Medium | Medium | Never pass the preference into list code paths; test asserting list results are identical in both states. |
| Double-counting between planned rows and recurring projections | Medium | Medium | `_get_recurring_projections` and the cash-flow forecast must not project an occurrence that already has a planned row — reuse the existing `recurring_match_service` linkage rather than inventing a second rule. |
| Frontend and backend credit-card cycle math diverge | Medium | Low | Bill assignment for planned rows goes through the existing `apply_effective_date`; no new date logic on either side. |
| Three-valued `status` breaks the closed-bill carve-outs | Low | Medium | Those predicates test `status == "pending"` explicitly, so planned does not match; covered by a regression test. |

## Test Strategy

**Unit**

- `compute_committed_credit`: null limit, zero planned, planned exceeding limit, positive balance.
- `counts_as_realized` / `include_planned` variants: correct rows in and out for each status.
- Date-driven default logic in the dialog: future → planned, past/today → realized, sticky once
  touched, never applied on edit.

**Integration** (the bulk of the value — these are where a missed call site shows up)

- One planned transaction seeded; assert in **both** toggle states: dashboard totals,
  spending-by-category, budget actuals, cash-flow report, account settled balance, balance history.
  Covers the isolation and toggle criteria.
- List membership identical in both toggle states — the D3 guard.
- Balance regression: connected account + future-dated debit → today's balance equals the provider
  balance. This test fails on `main`.
- Sync safety: `_find_synced_duplicate` offered a planned twin leaves it untouched; incoming
  transaction is inserted separately.
- Credit card: planned purchase reduces committed credit immediately; lands in the correct future
  bill by close-day convention; leaves a closed bill's total and `minimum_payment` unchanged.
- Promotion preserves id, category, notes, tags, attachments, splits, instalment metadata.
- Overdue endpoint returns only past-dated planned rows.
- Migration: future recurring placeholders reclassified, past ones and manual rows untouched,
  downgrade reverses.
- Both `cash` and `accrual` accounting modes for the aggregate tests, since `reporting_date_col`
  changes which date column is bucketed on.

**Manual QA**

- The entry flow end to end, including the sticky-default behavior, which is awkward to assert
  automatically.
- Visual distinction of planned rows in every list.

## Out of Scope

Deferred implementation choices, recorded so they are not rediscovered as gaps:

- Auto-matching planned → realized on sync (spec Non-Goal; `recurring_match_service` already has the
  machinery when this is picked up).
- Populating the native instalment columns from manual entry (spec Open Question; own spec).
- CSV/OFX export behavior for planned rows — export currently has no notion of status; left
  unchanged, meaning planned rows export as ordinary transactions. Flagged in the spec's open
  questions and not resolved here.
- FX handling for planned foreign-currency entries: they follow the existing create path, stamping
  the rate at write time. Re-stamping on promotion is not implemented.
- Account closure/deletion behavior for planned rows: they follow the existing cascade, same as any
  transaction.

## Revision History

| Version | Date       | Author       | Change       |
| ------- | ---------- | ------------ | ------------ |
| 0.1.0   | 2026-08-15 | Victor Alves | Initial plan |
| 1.0.0   | 2026-08-15 | Victor Alves | Approved. Broken into tasks T1–T14. |
