"""Coverage guard: one planned row, every surface, both toggle states.

See planning/002-planned-transactions (T14). Per-task tests verify the site
each task touched; they cannot catch a site nobody thought about — and
`status` was absent from *every* aggregate in this codebase before this
feature, so the converted surface is wide. This asserts coverage from the
outside.

Two rows are deliberate exceptions and are the ones most likely to be got
wrong:

  * settled balance is **never** toggle-governed — an account balance
    answers "what does the bank hold?", which a commitment cannot change;
  * list contents are **never** toggle-governed (spec D3).

Everything else moves with the toggle, and by *exactly* the planned amount —
asserting merely "it changed" would also pass if the row were double-counted.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services import admin_service

PLANNED = Decimal("321.00")

pytestmark = pytest.mark.asyncio


async def _set_include_planned(session, user: User, value: bool) -> None:
    prefs = dict(user.preferences or {})
    prefs["include_planned"] = value
    user.preferences = prefs
    await session.commit()


@pytest.fixture(params=["cash", "accrual"])
async def accounting_mode(request, session):
    """`reporting_date_col` picks a different date column per mode, so a bug
    can hide in one and not the other."""
    await admin_service.set_app_setting(
        session, "credit_card_accounting_mode", request.param
    )
    return request.param


@pytest.fixture
async def surface(session, test_user, test_workspace):
    """One account, one category with a budget, and one planned expense
    dated mid-month so it lands in the current bucket under either mode."""
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Coverage Acc", type="checking", balance=Decimal("0"), currency="BRL",
    )
    category = Category(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Coverage Cat", icon="tag", color="#123", is_system=False,
    )
    session.add_all([account, category])
    await session.commit()

    month_start = date.today().replace(day=1)
    session.add(Budget(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        category_id=category.id, amount=Decimal("5000"), month=month_start,
    ))
    when = date.today().replace(day=15)
    session.add(Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=account.id, category_id=category.id,
        description="the-planned-row", amount=PLANNED, date=when,
        effective_date=when, type="debit", source="manual", status="planned",
        currency="BRL", created_at=datetime.now(timezone.utc),
    ))
    await session.commit()
    return {"account": account, "category": category, "month": month_start}


def _month_param() -> str:
    return date.today().replace(day=1).isoformat()


async def _both_states(client, auth_headers, session, user, read):
    """Return (value_with_toggle_off, value_with_toggle_on)."""
    await _set_include_planned(session, user, False)
    off = await read()
    await _set_include_planned(session, user, True)
    on = await read()
    return off, on


# ---------------------------------------------------------------------------
# Toggle-governed figures — each must move by exactly PLANNED
# ---------------------------------------------------------------------------


async def test_dashboard_totals(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    async def read():
        r = await client.get(
            f"/api/dashboard/summary?month={_month_param()}", headers=auth_headers
        )
        assert r.status_code == 200
        return float(r.json()["monthly_expenses"])

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert on - off == pytest.approx(float(PLANNED))


async def test_spending_by_category(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    async def read():
        r = await client.get(
            f"/api/dashboard/spending-by-category?month={_month_param()}",
            headers=auth_headers,
        )
        return sum(float(row["total"]) for row in r.json())

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert on - off == pytest.approx(float(PLANNED))


async def test_budget_actuals(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    cat_id = str(surface["category"].id)

    async def read():
        r = await client.get(
            f"/api/budgets/comparison?month={_month_param()}", headers=auth_headers
        )
        assert r.status_code == 200
        row = next((x for x in r.json() if str(x["category_id"]) == cat_id), None)
        return float(row["actual_amount"]) if row else 0.0

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert on - off == pytest.approx(float(PLANNED))


async def test_cash_flow_report(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    async def read():
        r = await client.get(
            "/api/reports/cash-flow?months=2&interval=daily", headers=auth_headers
        )
        assert r.status_code == 200
        return sum(
            abs(float(v))
            for point in r.json()["trend"]
            for key, v in point["breakdowns"].items()
            if "out" in key.lower() or "expense" in key.lower()
        )

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert on - off == pytest.approx(float(PLANNED))


async def test_per_account_stats(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    account_id = surface["account"].id

    async def read():
        r = await client.get(
            f"/api/accounts/{account_id}/summary", headers=auth_headers
        )
        assert r.status_code == 200
        return float(r.json()["monthly_expenses"])

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert on - off == pytest.approx(float(PLANNED))


# ---------------------------------------------------------------------------
# The exceptions
# ---------------------------------------------------------------------------


async def test_settled_balance_is_not_toggle_governed(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    async def read():
        r = await client.get("/api/accounts", headers=auth_headers)
        assert r.status_code == 200
        row = next(a for a in r.json() if a["id"] == str(surface["account"].id))
        return float(row["current_balance"])

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert off == pytest.approx(0.0)
    assert on == pytest.approx(0.0)


async def test_balance_history_elapsed_days_are_not_toggle_governed(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    async def read():
        r = await client.get(
            f"/api/dashboard/balance-history?month={_month_param()}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        return [d["balance"] for d in r.json()["current"] if d["balance"] is not None]

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert off == on
    assert all(v == pytest.approx(0.0) for v in off)


async def test_list_contents_are_not_toggle_governed(
    client, auth_headers, session, test_user, surface, accounting_mode
):
    async def read():
        r = await client.get("/api/transactions", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        return body["total"], sorted(i["description"] for i in body["items"])

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert off == on
    assert "the-planned-row" in off[1]


# ---------------------------------------------------------------------------
# Credit card
# ---------------------------------------------------------------------------


async def test_committed_credit_reflects_planned_in_both_states(
    client, auth_headers, session, test_user, test_workspace, accounting_mode
):
    """Committed limit is not toggle-governed either: a planned purchase is
    committed the moment it is recorded."""
    card = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Coverage Card", type="credit_card", balance=Decimal("0"),
        currency="BRL", credit_limit=Decimal("4000"),
        statement_close_day=20, payment_due_day=28,
    )
    session.add(card)
    await session.commit()

    when = date.today() + timedelta(days=45)
    session.add(Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=card.id, description="planned-card-buy", amount=PLANNED,
        date=when, effective_date=when, type="debit", source="manual",
        status="planned", currency="BRL", created_at=datetime.now(timezone.utc),
    ))
    await session.commit()

    async def read():
        r = await client.get("/api/accounts", headers=auth_headers)
        row = next(a for a in r.json() if a["id"] == str(card.id))
        return row["available_credit"], row["committed_credit"], row["planned_amount"]

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    assert off == on
    available, committed, planned = off
    assert planned == pytest.approx(float(PLANNED))
    assert available - committed == pytest.approx(float(PLANNED))


# ---------------------------------------------------------------------------
# Overdue surface
# ---------------------------------------------------------------------------


async def test_overdue_planned_is_not_toggle_governed(
    client, auth_headers, session, test_user, test_workspace, surface, accounting_mode
):
    when = date.today() - timedelta(days=3)
    session.add(Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=surface["account"].id, description="stale-planned",
        amount=Decimal("10"), date=when, effective_date=when, type="debit",
        source="manual", status="planned", currency="BRL",
        created_at=datetime.now(timezone.utc),
    ))
    await session.commit()

    async def read():
        r = await client.get(
            "/api/transactions/planned/overdue", headers=auth_headers
        )
        assert r.status_code == 200
        body = r.json()
        return body["count"], sorted(i["description"] for i in body["items"])

    off, on = await _both_states(client, auth_headers, session, test_user, read)
    # Toggle-independence is the claim under test. The exact count is not
    # asserted here: `surface` seeds a mid-month planned row that is overdue
    # or not depending on the day the suite runs, and pinning a number made
    # this pass only before the 15th. Exact counting is covered by
    # test_planned_transactions_list.py, which controls every seeded date.
    assert off == on
    assert "stale-planned" in off[1]
