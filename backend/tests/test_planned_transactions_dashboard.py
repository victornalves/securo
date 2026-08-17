"""The `include_planned` preference and its effect on dashboard figures.

See planning/002-planned-transactions (T4). The rule under test: planned
transactions are excluded from computed figures unless the user opts in, and
the opt-in moves each figure by exactly the planned amount — not merely
"changes it", which a double-counting bug would also satisfy.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User

PLANNED_AMOUNT = Decimal("777.00")


def _current_month_str() -> str:
    return date.today().replace(day=1).isoformat()


async def _set_include_planned(session: AsyncSession, user: User, value: bool) -> None:
    # Copy-then-assign: SQLAlchemy does not track in-place mutation of a
    # JSON dict, so mutating `user.preferences` directly would not persist.
    prefs = dict(user.preferences or {})
    prefs["include_planned"] = value
    user.preferences = prefs
    await session.commit()


@pytest.fixture
def _planned_date():
    """A date inside the current month, so it lands in the month's bucket."""
    today = date.today()
    # Day 15 is always within the month and avoids month-boundary flakiness.
    return today.replace(day=15)


async def _add_planned_expense(session, user, account, when):
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        workspace_id=account.workspace_id,
        account_id=account.id,
        description="Planned rent",
        amount=PLANNED_AMOUNT,
        date=when,
        effective_date=when,
        type="debit",
        source="manual",
        status="planned",
        currency="BRL",
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    return txn


@pytest.fixture
async def planned_setup(session, test_user, test_workspace, _planned_date):
    account = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        name="Planned Acc",
        type="checking",
        balance=Decimal("0"),
        currency="BRL",
    )
    session.add(account)
    await session.commit()
    await _add_planned_expense(session, test_user, account, _planned_date)
    return account


@pytest.mark.asyncio
async def test_user_include_planned_defaults_false(test_user):
    """An unset preference must exclude planned — the safe direction."""
    assert test_user.include_planned is False


@pytest.mark.asyncio
async def test_summary_excludes_planned_by_default(
    client, auth_headers, session, test_user, planned_setup
):
    resp = await client.get(
        f"/api/dashboard/summary?month={_current_month_str()}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert float(resp.json()["monthly_expenses"]) == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_summary_includes_planned_when_enabled(
    client, auth_headers, session, test_user, planned_setup
):
    """The figure must move by *exactly* the planned amount — a weaker
    "it changed" assertion would also pass if the row were double-counted."""
    await _set_include_planned(session, test_user, True)

    resp = await client.get(
        f"/api/dashboard/summary?month={_current_month_str()}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert float(resp.json()["monthly_expenses"]) == pytest.approx(float(PLANNED_AMOUNT))


@pytest.mark.asyncio
async def test_spending_by_category_respects_preference(
    client, auth_headers, session, test_user, planned_setup
):
    url = f"/api/dashboard/spending-by-category?month={_current_month_str()}"

    off = await client.get(url, headers=auth_headers)
    assert sum(float(r["total"]) for r in off.json()) == pytest.approx(0.0)

    await _set_include_planned(session, test_user, True)
    on = await client.get(url, headers=auth_headers)
    assert sum(float(r["total"]) for r in on.json()) == pytest.approx(float(PLANNED_AMOUNT))


async def _register_sqlite_to_char(session):
    """get_monthly_trend uses Postgres' to_char; install a matching scalar
    function so the path is exercised under the SQLite test backend."""
    def _to_char(value, fmt):
        return None if value is None else str(value)[:7]

    raw = await session.connection()

    def _install(dbapi_conn):
        dbapi_conn.create_function("to_char", 2, _to_char)

    await raw.run_sync(lambda conn: _install(conn.connection.dbapi_connection))


@pytest.mark.asyncio
async def test_monthly_trend_respects_preference(
    session, test_user, test_workspace, planned_setup
):
    """Exercised at the service layer — the API test would need Postgres."""
    from app.services.dashboard_service import get_monthly_trend

    await _register_sqlite_to_char(session)

    off = await get_monthly_trend(session, test_workspace.id, test_user.id, months=3)
    assert sum(t.expenses for t in off) == pytest.approx(0.0)

    await _set_include_planned(session, test_user, True)
    on = await get_monthly_trend(session, test_workspace.id, test_user.id, months=3)
    assert sum(t.expenses for t in on) == pytest.approx(float(PLANNED_AMOUNT))


@pytest.mark.asyncio
async def test_preference_round_trips_without_clobbering_others(
    client, auth_headers, session, test_user
):
    """The copy-then-assign bug shows up here: writing one preference key
    must not drop the rest."""
    prefs = dict(test_user.preferences or {})
    prefs["currency_display"] = "BRL"
    prefs["language"] = "pt-BR"
    test_user.preferences = prefs
    await session.commit()

    resp = await client.patch(
        "/api/users/me",
        headers=auth_headers,
        json={"preferences": {**prefs, "include_planned": True}},
    )
    assert resp.status_code == 200

    await session.refresh(test_user)
    assert test_user.include_planned is True
    assert test_user.preferences["currency_display"] == "BRL"
    assert test_user.preferences["language"] == "pt-BR"


@pytest.mark.asyncio
async def test_planned_row_dated_outside_month_does_not_leak(
    client, auth_headers, session, test_user, test_workspace
):
    """Enabling the preference must not pull in commitments from other
    months — the status axis and the date bucket are independent."""
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Next Month", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(account)
    await session.commit()

    next_month = (date.today().replace(day=1) + timedelta(days=40)).replace(day=10)
    await _add_planned_expense(session, test_user, account, next_month)
    await _set_include_planned(session, test_user, True)

    resp = await client.get(
        f"/api/dashboard/summary?month={_current_month_str()}", headers=auth_headers
    )
    assert float(resp.json()["monthly_expenses"]) == pytest.approx(0.0)
