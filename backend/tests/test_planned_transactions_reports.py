"""Planned transactions across budgets, reports and per-account stats.

See planning/002-planned-transactions (T5). Forecast *inputs* are the
interesting case: a planned row must never feed the historical mean that
would then be used to forecast it.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction
from app.models.user import User

PLANNED = Decimal("500.00")
REALIZED = Decimal("120.00")


async def _set_include_planned(session: AsyncSession, user: User, value: bool) -> None:
    prefs = dict(user.preferences or {})
    prefs["include_planned"] = value
    user.preferences = prefs
    await session.commit()


async def _add(session, user, workspace_id, account, amount, when, *,
               status="posted", category_id=None, recurring_id=None):
    txn = Transaction(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace_id,
        account_id=account.id, category_id=category_id,
        description=f"tx-{status}", amount=amount, date=when,
        effective_date=when, type="debit", source="manual", status=status,
        currency="BRL", recurring_transaction_id=recurring_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    return txn


@pytest.fixture
async def acc(session, test_user, test_workspace):
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Reports Acc", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


@pytest.fixture
async def cat(session, test_user, test_workspace):
    category = Category(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Utilities", icon="zap", color="#fa0", is_system=False,
    )
    session.add(category)
    await session.commit()
    return category


def _mid_month() -> date:
    return date.today().replace(day=15)


# ---------------------------------------------------------------------------
# Budget actuals
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_budget_actuals_respect_preference(
    session, test_user, test_workspace, acc, cat
):
    from app.services.budget_service import get_budget_vs_actual

    month_start = date.today().replace(day=1)
    session.add(Budget(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        category_id=cat.id, amount=Decimal("2000"), month=month_start,
    ))
    await session.commit()

    await _add(session, test_user, test_workspace.id, acc, REALIZED,
               _mid_month(), category_id=cat.id)
    await _add(session, test_user, test_workspace.id, acc, PLANNED,
               _mid_month(), status="planned", category_id=cat.id)

    off = await get_budget_vs_actual(session, test_workspace.id, test_user.id, month_start)
    row = next(r for r in off if str(r.category_id) == str(cat.id))
    assert float(row.actual_amount) == pytest.approx(float(REALIZED))

    await _set_include_planned(session, test_user, True)
    on = await get_budget_vs_actual(session, test_workspace.id, test_user.id, month_start)
    row = next(r for r in on if str(r.category_id) == str(cat.id))
    assert float(row.actual_amount) == pytest.approx(float(REALIZED + PLANNED))


# ---------------------------------------------------------------------------
# Per-account stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_account_summary_respects_preference(
    client, auth_headers, session, test_user, test_workspace, acc
):
    await _add(session, test_user, test_workspace.id, acc, REALIZED, _mid_month())
    await _add(session, test_user, test_workspace.id, acc, PLANNED, _mid_month(),
               status="planned")

    url = f"/api/accounts/{acc.id}/summary"
    off = await client.get(url, headers=auth_headers)
    assert off.status_code == 200
    assert float(off.json()["monthly_expenses"]) == pytest.approx(float(REALIZED))

    await _set_include_planned(session, test_user, True)
    on = await client.get(url, headers=auth_headers)
    assert float(on.json()["monthly_expenses"]) == pytest.approx(float(REALIZED + PLANNED))


# ---------------------------------------------------------------------------
# Forecast inputs must stay realized-only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_baseline_projection_ignores_planned_even_when_enabled(
    session, test_user, test_workspace, acc
):
    """The historical mean must not be fed by a planned row — otherwise a
    commitment forecasts itself. This holds in *both* toggle states."""
    from app.services.report_service import _get_baseline_projection

    last_month = date.today() - timedelta(days=15)
    await _add(session, test_user, test_workspace.id, acc, REALIZED, last_month)
    # Past-dated planned row: only a status check can exclude this — a date
    # bound cannot, which is why the forecast path uses counts_as_realized().
    await _add(session, test_user, test_workspace.id, acc, PLANNED, last_month,
               status="planned")

    await _set_include_planned(session, test_user, True)

    today = date.today()

    async def _to_primary(amount, ccy):
        return float(amount)

    flows, lookback_days = await _get_baseline_projection(
        session, test_workspace.id, today, today + timedelta(days=3),
        "BRL", _to_primary,
    )
    debits = [f for f in flows if f["type"] == "debit"]
    assert debits, "expected a baseline outflow"
    # Each synthetic day carries the mean daily outflow; multiplying back by
    # the look-back window recovers the total it was derived from.
    recovered_total = debits[0]["amount"] * lookback_days
    assert recovered_total == pytest.approx(float(REALIZED))


@pytest.mark.asyncio
async def test_earliest_transaction_date_ignores_planned(
    session, test_user, test_workspace, acc
):
    """A planned row must not redefine where the user's history starts."""
    from app.services.report_service import _get_earliest_transaction_date

    realized_day = date.today() - timedelta(days=30)
    await _add(session, test_user, test_workspace.id, acc, REALIZED, realized_day)
    await _add(session, test_user, test_workspace.id, acc, PLANNED,
               date.today() - timedelta(days=300), status="planned")

    assert await _get_earliest_transaction_date(session, test_workspace.id) == realized_day


# ---------------------------------------------------------------------------
# Double counting against recurring projections
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_materialized_recurring_row_is_not_also_projected(
    session, test_user, test_workspace, acc, cat
):
    """A recurring occurrence that already has a row must be counted once.

    The guard is `next_occurrence`: generate_pending advances it past every
    occurrence it materializes, and _get_recurring_projections starts from
    there. This test pins that behavior so T8 (placeholders become planned)
    can't silently start double-counting.
    """
    from app.services.dashboard_service import _get_recurring_projections

    month_start = date.today().replace(day=1)
    month_end = (month_start + timedelta(days=40)).replace(day=1)
    occurrence = month_start.replace(day=10)

    rec = RecurringTransaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=acc.id, category_id=cat.id, description="Rent",
        amount=Decimal("1000"), currency="BRL", type="debit",
        frequency="monthly", day_of_month=10, start_date=occurrence,
        is_active=True, auto_generate=True,
        # Already materialized this month's occurrence — the cursor moved on.
        next_occurrence=(month_end.replace(day=10)),
    )
    session.add(rec)
    await session.commit()

    await _add(session, test_user, test_workspace.id, acc, Decimal("1000"),
               occurrence, status="planned", category_id=cat.id, recurring_id=rec.id)

    projections = await _get_recurring_projections(
        session, test_workspace.id, month_start, month_end
    )
    assert projections == []


# ---------------------------------------------------------------------------
# Cash flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cash_flow_report_respects_preference(
    client, auth_headers, session, test_user, test_workspace, acc
):
    """A planned commitment dated in the future belongs in the forecast only
    when the user asked for it."""
    future = date.today() + timedelta(days=5)
    await _add(session, test_user, test_workspace.id, acc, PLANNED, future,
               status="planned")

    url = "/api/reports/cash-flow?months=2&interval=daily"

    def _outflow(payload):
        return sum(
            abs(float(v))
            for point in payload["trend"]
            for key, v in point["breakdowns"].items()
            if "out" in key.lower() or "expense" in key.lower()
        )

    off = await client.get(url, headers=auth_headers)
    assert off.status_code == 200
    off_total = _outflow(off.json())

    await _set_include_planned(session, test_user, True)
    on = await client.get(url, headers=auth_headers)
    assert on.status_code == 200
    on_total = _outflow(on.json())

    assert on_total - off_total == pytest.approx(float(PLANNED))
