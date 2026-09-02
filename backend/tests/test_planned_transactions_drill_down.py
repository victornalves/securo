"""The dashboard drill-down drawer and the figures it explains.

See planning/006-planned-transactions-in-dashboard-drill-down. The rule under
test: `user_pnl_only` means "the rows behind a dashboard figure", and that
definition follows the user's include-planned preference — so the drawer's
contents reconcile with the chart instead of silently under-reporting it
(006/D1). `pnl_include_planned` overrides the preference, which is what lets
the uncategorized worklist count planned rows in both states (006/D3).

The visibility axis is untouched: /transactions without `user_pnl_only`
returns the same rows in both preference states (002/D3).
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services import admin_service

REALIZED_AMOUNT = Decimal("120.00")
PLANNED_AMOUNT = Decimal("777.00")


def _month_bounds() -> tuple[str, str]:
    """First and last day of the current month, as the drawer sends them."""
    first = date.today().replace(day=1)
    next_first = (
        first.replace(year=first.year + 1, month=1)
        if first.month == 12
        else first.replace(month=first.month + 1)
    )
    last = next_first - timedelta(days=1)
    return first.isoformat(), last.isoformat()


def _mid_month() -> date:
    """Day 15 always exists and avoids month-boundary flakiness."""
    return date.today().replace(day=15)


async def _set_include_planned(session: AsyncSession, user: User, value: bool) -> None:
    # Copy-then-assign: SQLAlchemy does not track in-place mutation of a JSON
    # dict, so mutating `user.preferences` directly would not persist.
    prefs = dict(user.preferences or {})
    prefs["include_planned"] = value
    user.preferences = prefs
    await session.commit()


def _tx(
    user: User,
    account: Account,
    *,
    description: str,
    amount: Decimal,
    status: str = "posted",
    category_id=None,
    txn_type: str = "debit",
    is_ignored: bool = False,
    when: date | None = None,
    source: str = "manual",
) -> Transaction:
    when = when or _mid_month()
    return Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        workspace_id=account.workspace_id,
        account_id=account.id,
        category_id=category_id,
        description=description,
        amount=amount,
        currency="BRL",
        date=when,
        effective_date=when,
        type=txn_type,
        source=source,
        status=status,
        is_ignored=is_ignored,
        created_at=datetime.now(timezone.utc),
    )


@pytest.fixture
async def acc(session: AsyncSession, test_user: User, test_workspace) -> Account:
    account = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        name="Drill-down Acc",
        type="checking",
        balance=Decimal("0"),
        currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


@pytest.fixture
async def one_realized_one_planned(session: AsyncSession, test_user: User, acc: Account):
    """The minimal shape of the bug: a figure made of both states."""
    session.add(_tx(test_user, acc, description="Realized groceries", amount=REALIZED_AMOUNT))
    session.add(
        _tx(test_user, acc, description="Planned rent", amount=PLANNED_AMOUNT, status="planned")
    )
    await session.commit()
    return acc


def _descriptions(payload: dict) -> list[str]:
    return [item["description"] for item in payload["items"]]


# ---------------------------------------------------------------------------
# The preference governs the drill-down's P&L predicate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preference_off_returns_realized_only(
    client: AsyncClient, auth_headers, one_realized_one_planned
):
    """Today's behaviour, which must not change when the preference is off."""
    resp = await client.get("/api/transactions?user_pnl_only=true", headers=auth_headers)

    assert resp.status_code == 200
    assert _descriptions(resp.json()) == ["Realized groceries"]


@pytest.mark.asyncio
async def test_preference_on_includes_planned(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
    one_realized_one_planned,
):
    """The list must grow by *exactly* the planned row — "it changed" would
    also be satisfied by a double-counting bug."""
    await _set_include_planned(session, test_user, True)

    resp = await client.get("/api/transactions?user_pnl_only=true", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert sorted(_descriptions(data)) == ["Planned rent", "Realized groceries"]
    total = sum(abs(float(item["amount"])) for item in data["items"])
    assert total == pytest.approx(float(REALIZED_AMOUNT + PLANNED_AMOUNT))


# ---------------------------------------------------------------------------
# The explicit override — the uncategorized worklist's path (006/D3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_override_true_includes_planned_with_preference_off(
    client: AsyncClient, auth_headers, one_realized_one_planned
):
    resp = await client.get(
        "/api/transactions?user_pnl_only=true&pnl_include_planned=true", headers=auth_headers
    )

    assert resp.status_code == 200
    assert sorted(_descriptions(resp.json())) == ["Planned rent", "Realized groceries"]


@pytest.mark.asyncio
async def test_override_false_excludes_planned_with_preference_on(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
    one_realized_one_planned,
):
    await _set_include_planned(session, test_user, True)

    resp = await client.get(
        "/api/transactions?user_pnl_only=true&pnl_include_planned=false", headers=auth_headers
    )

    assert resp.status_code == 200
    assert _descriptions(resp.json()) == ["Realized groceries"]


@pytest.mark.asyncio
async def test_uncategorized_drill_down_lists_planned_in_both_states(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User, acc: Account
):
    """`pending_categorization` has no status predicate, so its drawer must
    count planned rows regardless of the preference (006/D3)."""
    session.add(
        _tx(test_user, acc, description="Planned uncategorized", amount=PLANNED_AMOUNT,
            status="planned")
    )
    await session.commit()

    url = "/api/transactions?user_pnl_only=true&uncategorized=true&pnl_include_planned=true"

    off = await client.get(url, headers=auth_headers)
    assert _descriptions(off.json()) == ["Planned uncategorized"]

    await _set_include_planned(session, test_user, True)
    on = await client.get(url, headers=auth_headers)
    assert _descriptions(on.json()) == ["Planned uncategorized"]


# ---------------------------------------------------------------------------
# Planned composes with the exclusions that were already there
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planned_still_excluded_when_row_is_ignored(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User, acc: Account
):
    await _set_include_planned(session, test_user, True)
    session.add(
        _tx(test_user, acc, description="Planned ignored", amount=PLANNED_AMOUNT,
            status="planned", is_ignored=True)
    )
    await session.commit()

    resp = await client.get("/api/transactions?user_pnl_only=true", headers=auth_headers)

    assert _descriptions(resp.json()) == []


@pytest.mark.asyncio
async def test_planned_still_excluded_in_closed_account(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
    test_workspace, acc: Account,
):
    await _set_include_planned(session, test_user, True)
    acc.is_closed = True
    session.add(
        _tx(test_user, acc, description="Planned in closed acc", amount=PLANNED_AMOUNT,
            status="planned")
    )
    await session.commit()

    resp = await client.get("/api/transactions?user_pnl_only=true", headers=auth_headers)

    assert _descriptions(resp.json()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("flag", ["is_ignored", "treat_as_transfer"])
async def test_planned_still_excluded_by_category_flags(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
    test_workspace, acc: Account, flag: str,
):
    await _set_include_planned(session, test_user, True)
    category = Category(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        name=f"Excluded via {flag}",
        icon="circle-help",
        color="#6B7280",
        **{flag: True},
    )
    session.add(category)
    await session.flush()
    session.add(
        _tx(test_user, acc, description="Planned in excluded category",
            amount=PLANNED_AMOUNT, status="planned", category_id=category.id)
    )
    await session.commit()

    resp = await client.get("/api/transactions?user_pnl_only=true", headers=auth_headers)

    assert _descriptions(resp.json()) == []


@pytest.mark.asyncio
async def test_planned_settlement_debit_still_excluded(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User, acc: Account
):
    """Settlement rows are dropped from user P&L wholesale; planned state does
    not readmit them."""
    await _set_include_planned(session, test_user, True)
    session.add(
        _tx(test_user, acc, description="Planned settlement", amount=PLANNED_AMOUNT,
            status="planned", source="settlement")
    )
    await session.commit()

    resp = await client.get("/api/transactions?user_pnl_only=true", headers=auth_headers)

    assert _descriptions(resp.json()) == []


# ---------------------------------------------------------------------------
# Reconciliation — the criterion the whole spec exists for
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["cash", "accrual"])
async def test_drill_down_total_equals_the_category_figure(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
    test_workspace, acc: Account, mode: str,
):
    """The bar the user clicks and the drawer that opens must agree.

    Deliberately no recurring rules in this fixture: `spending-by-category`
    also folds in virtual projections, and keeping them out of the picture
    makes the comparison exact rather than approximately right.
    """
    await admin_service.set_app_setting(session, "credit_card_accounting_mode", mode)
    await _set_include_planned(session, test_user, True)

    category = Category(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        name="Moradia",
        icon="house",
        color="#3B82F6",
    )
    session.add(category)
    await session.flush()
    session.add(_tx(test_user, acc, description="Realized rent share",
                    amount=REALIZED_AMOUNT, category_id=category.id))
    session.add(_tx(test_user, acc, description="Planned rent", amount=PLANNED_AMOUNT,
                    status="planned", category_id=category.id))
    await session.commit()

    month = date.today().replace(day=1).isoformat()
    chart = await client.get(
        f"/api/dashboard/spending-by-category?month={month}", headers=auth_headers
    )
    assert chart.status_code == 200
    slice_total = next(
        float(row["total"]) for row in chart.json()
        if row["category_id"] == str(category.id)
    )

    first, last = _month_bounds()
    drawer = await client.get(
        f"/api/transactions?user_pnl_only=true&category_id={category.id}"
        f"&type=debit&from={first}&to={last}",
        headers=auth_headers,
    )
    assert drawer.status_code == 200
    drawer_total = sum(abs(float(item["amount"])) for item in drawer.json()["items"])

    assert drawer_total == pytest.approx(slice_total)


# ---------------------------------------------------------------------------
# The visibility axis is untouched (002/D3 still holds for the browse list)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plain_list_is_identical_in_both_preference_states(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
    one_realized_one_planned,
):
    off = await client.get("/api/transactions", headers=auth_headers)
    await _set_include_planned(session, test_user, True)
    on = await client.get("/api/transactions", headers=auth_headers)

    assert off.status_code == on.status_code == 200
    assert sorted(_descriptions(off.json())) == sorted(_descriptions(on.json()))
    assert off.json()["total"] == on.json()["total"] == 2
