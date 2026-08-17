"""Balance and balance-history behaviour for planned transactions.

See planning/002-planned-transactions (T6). The rule that separates this from
every other aggregate: settled balance is **never** governed by the
include-planned preference. An account balance answers "what does the bank
hold?", which a commitment cannot change.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.services.dashboard_service import _account_balance_at, get_balance_history

PLANNED = Decimal("400.00")


async def _set_include_planned(session, user: User, value: bool) -> None:
    prefs = dict(user.preferences or {})
    prefs["include_planned"] = value
    user.preferences = prefs
    await session.commit()


async def _add(session, user, workspace_id, account, amount, when, *,
               status="posted", txn_type="debit", transfer_pair_id=None):
    txn = Transaction(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace_id,
        account_id=account.id, description=f"tx-{status}", amount=amount,
        date=when, effective_date=when, type=txn_type, source="manual",
        status=status, currency="BRL", transfer_pair_id=transfer_pair_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    return txn


@pytest.fixture
async def manual_acc(session, test_user, test_workspace):
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Bal Acc", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


@pytest.mark.asyncio
@pytest.mark.parametrize("toggle", [False, True])
async def test_settled_balance_never_includes_planned(
    session, test_user, test_workspace, manual_acc, toggle
):
    """The exception to every other aggregate: the toggle does not apply."""
    await _set_include_planned(session, test_user, toggle)

    yesterday = date.today() - timedelta(days=1)
    await _add(session, test_user, test_workspace.id, manual_acc,
               Decimal("1000"), yesterday, txn_type="credit")
    await _add(session, test_user, test_workspace.id, manual_acc,
               PLANNED, yesterday, status="planned")

    bal = await _account_balance_at(session, manual_acc, date.today())
    assert bal == pytest.approx(1000.0)


@pytest.mark.asyncio
async def test_balance_keeps_paired_transfers(
    session, test_user, test_workspace, manual_acc
):
    """Guards the reason balance uses a status-only predicate instead of
    counts_as_realized: a transfer is excluded from P&L but genuinely moves
    money out of this account."""
    pair = uuid.uuid4()
    yesterday = date.today() - timedelta(days=1)
    await _add(session, test_user, test_workspace.id, manual_acc,
               Decimal("1000"), yesterday, txn_type="credit")
    await _add(session, test_user, test_workspace.id, manual_acc,
               Decimal("300"), yesterday, transfer_pair_id=pair)

    bal = await _account_balance_at(session, manual_acc, date.today())
    assert bal == pytest.approx(700.0)


@pytest.mark.asyncio
@pytest.mark.parametrize("toggle", [False, True])
async def test_balance_history_past_days_ignore_planned(
    session, test_user, test_workspace, manual_acc, toggle
):
    await _set_include_planned(session, test_user, toggle)

    today = date.today()
    if today.day < 3:
        pytest.skip("needs at least two elapsed days in the month")
    past_day = today.replace(day=today.day - 1)

    await _add(session, test_user, test_workspace.id, manual_acc,
               PLANNED, past_day, status="planned")

    history = await get_balance_history(session, test_workspace.id, test_user.id)
    elapsed = [d for d in history.current if d.balance is not None]
    assert all(d.balance == pytest.approx(0.0) for d in elapsed)


@pytest.mark.asyncio
async def test_daily_deltas_future_window_follows_preference(
    session, test_user, test_workspace, manual_acc
):
    """Future days are a projection — that is where commitments belong.

    Exercised on `_daily_deltas` directly: `get_balance_history` renders
    every day after today as `None` for the current month, so the future
    window's contents are not observable through it today.
    """
    from app.services.dashboard_service import _daily_deltas

    today = date.today()
    start = today + timedelta(days=1)
    end = start + timedelta(days=5)

    await _add(session, test_user, test_workspace.id, manual_acc,
               PLANNED, start, status="planned")

    off = await _daily_deltas(session, test_workspace.id, start, end)
    assert sum(off.values()) == pytest.approx(0.0)

    on = await _daily_deltas(
        session, test_workspace.id, start, end, include_planned=True
    )
    assert sum(on.values()) == pytest.approx(-float(PLANNED))


@pytest.mark.asyncio
async def test_daily_deltas_keeps_future_posted_rows_when_preference_off(
    session, test_user, test_workspace, manual_acc
):
    """Splitting the month into two windows must not drop future *posted*
    rows when the preference is off."""
    from app.services.dashboard_service import _daily_deltas

    today = date.today()
    start = today + timedelta(days=1)
    end = start + timedelta(days=5)

    await _add(session, test_user, test_workspace.id, manual_acc,
               Decimal("250"), start, txn_type="credit")

    deltas = await _daily_deltas(session, test_workspace.id, start, end)
    assert sum(deltas.values()) == pytest.approx(250.0)
