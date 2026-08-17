"""Recurring placeholders must not be booked as settled.

See planning/002-planned-transactions (T8). `generate_pending` writes real
rows for occurrences it materializes, including future ones, and those rows
used to inherit the `posted` column default.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.models.account import Account
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction
from app.services.recurring_transaction_service import generate_pending

# The reclassification statements from alembic 066. Kept in sync by hand —
# the repo has no migration harness, so this exercises the predicate (the
# part that can be wrong) rather than the alembic plumbing.
MIGRATION_UP = """
    UPDATE transactions
       SET status = 'planned'
     WHERE source = 'recurring'
       AND status = 'posted'
       AND date > CURRENT_DATE
"""
MIGRATION_DOWN = """
    UPDATE transactions
       SET status = 'posted'
     WHERE source = 'recurring'
       AND status = 'planned'
       AND date > CURRENT_DATE
"""


@pytest.fixture
async def acc(session, test_user, test_workspace):
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Recurring Acc", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


@pytest.mark.asyncio
async def test_generate_pending_marks_future_occurrences_planned(
    session, test_user, test_workspace, acc
):
    today = date.today()
    start = today - timedelta(days=62)

    rec = RecurringTransaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=acc.id, description="Rent", amount=Decimal("1200"),
        currency="BRL", type="debit", frequency="monthly",
        day_of_month=start.day, start_date=start, next_occurrence=start,
        is_active=True, auto_generate=True,
    )
    session.add(rec)
    await session.commit()

    # Generate well past today so both sides of the boundary are produced.
    await generate_pending(session, test_user.id, up_to=today + timedelta(days=62))

    rows = (await session.execute(
        select(Transaction).where(Transaction.source == "recurring")
    )).scalars().all()
    assert rows, "expected placeholders to be generated"

    for row in rows:
        expected = "planned" if row.date > today else "posted"
        assert row.status == expected, f"{row.date} → {row.status}"

    assert any(r.status == "planned" for r in rows)
    assert any(r.status == "posted" for r in rows)


@pytest.mark.asyncio
async def test_migration_reclassifies_only_future_recurring_rows(
    session, test_user, test_workspace, acc
):
    today = date.today()
    future, past = today + timedelta(days=10), today - timedelta(days=10)

    def _row(desc, when, source):
        return Transaction(
            id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
            account_id=acc.id, description=desc, amount=Decimal("100"),
            date=when, effective_date=when, type="debit", source=source,
            status="posted", currency="BRL",
            created_at=datetime.now(timezone.utc),
        )

    seeded = {
        "future-recurring": _row("future-recurring", future, "recurring"),
        "past-recurring": _row("past-recurring", past, "recurring"),
        "future-manual": _row("future-manual", future, "manual"),
        "past-manual": _row("past-manual", past, "manual"),
    }
    session.add_all(seeded.values())
    await session.commit()

    await session.execute(text(MIGRATION_UP))
    await session.commit()

    async def _statuses():
        rows = (await session.execute(
            select(Transaction.description, Transaction.status)
            .where(Transaction.description.in_(seeded.keys()))
        )).all()
        return dict(rows)

    after = await _statuses()
    assert after["future-recurring"] == "planned"
    assert after["past-recurring"] == "posted"
    assert after["future-manual"] == "posted"
    assert after["past-manual"] == "posted"

    await session.execute(text(MIGRATION_DOWN))
    await session.commit()

    assert all(v == "posted" for v in (await _statuses()).values())


@pytest.mark.asyncio
async def test_migration_leaves_hand_corrected_rows_alone(
    session, test_user, test_workspace, acc
):
    """The `status = 'posted'` guard makes the statement idempotent and
    keeps it off rows the user already adjusted."""
    future = date.today() + timedelta(days=10)
    pending_row = Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=acc.id, description="already-pending", amount=Decimal("100"),
        date=future, effective_date=future, type="debit", source="recurring",
        status="pending", currency="BRL", created_at=datetime.now(timezone.utc),
    )
    session.add(pending_row)
    await session.commit()

    await session.execute(text(MIGRATION_UP))
    await session.commit()
    await session.refresh(pending_row)

    assert pending_row.status == "pending"
