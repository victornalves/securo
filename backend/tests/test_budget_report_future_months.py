"""Tests for future months on the budget report (spec 004).

Two properties are under test here. First, the report reports **realized** and
**planned** as separate quantities, in every month, independently of the user's
*include planned* preference (D2). Second, only *recorded* commitments count: a
virtual recurring occurrence dated after today contributes nowhere, while the
same occurrence written as a real `planned` row does (D3).

Months are expressed as offsets from today so "future" stays future whenever the
suite runs.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction
from app.schemas.budget import BudgetCreate
from app.services import admin_service
from app.services.budget_service import (
    create_budget,
    get_budget_vs_actual,
)
from app.services.report_service import get_budget_report, get_latest_planned_month


def _month(offset: int) -> date:
    """First day of the month `offset` months from the current one."""
    today = date.today()
    total = today.year * 12 + (today.month - 1) + offset
    return date(total // 12, total % 12 + 1, 1)


def _ym(offset: int) -> str:
    return _month(offset).strftime("%Y-%m")


@pytest_asyncio.fixture
async def acc(session: AsyncSession, test_user) -> Account:
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, name="FutureAcc",
        type="checking", balance=Decimal("10000"), currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


async def _recurring_envelope(session, workspace, user, category, amount="1000"):
    """A recurring envelope from the current month on — resolves for every
    future month, since `_build_budget_map` matches recurring rows with
    `month <= M`."""
    return await create_budget(
        session, workspace.id, user.id,
        BudgetCreate(
            category_id=category.id, amount=Decimal(amount),
            month=_month(0), is_recurring=True,
        ),
    )


def _tx(
    user, account, category_id, amount, on: date, *,
    status="posted", effective_bill_date=None, source="manual",
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(), user_id=user.id, account_id=account.id,
        category_id=category_id, description="tx", amount=Decimal(amount),
        date=on, type="debit", source=source, status=status,
        effective_bill_date=effective_bill_date,
        created_at=datetime.now(timezone.utc),
    )


def _rule(user, workspace, account, category_id, amount, first: date, *, auto_generate=True):
    return RecurringTransaction(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace.id,
        account_id=account.id, category_id=category_id, description="rule",
        amount=Decimal(amount), currency="BRL", type="debit", frequency="monthly",
        day_of_month=first.day, start_date=first, next_occurrence=first,
        is_active=True, auto_generate=auto_generate,
    )


# ---------------------------------------------------------------------------
# A future month
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_future_month_reports_planned_against_the_envelope(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add_all([
        _tx(test_user, acc, test_categories[0].id, "300", _month(2).replace(day=5),
            status="planned"),
        _tx(test_user, acc, test_categories[0].id, "250", _month(2).replace(day=15),
            status="planned"),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(2),
    )

    assert len(report.rows) == 1
    row = report.rows[0]
    assert row.budgeted == pytest.approx(1000.0)
    assert row.realized == 0.0
    assert row.planned == pytest.approx(550.0)
    # difference and percentage are on the committed basis
    assert row.difference == pytest.approx(450.0)
    assert row.percentage_used == pytest.approx(55.0)
    assert report.summary.balance == pytest.approx(1000.0)
    assert report.summary.committed_balance == pytest.approx(450.0)


@pytest.mark.asyncio
async def test_future_month_with_envelope_and_no_commitments_is_not_empty(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(3),
    )

    assert len(report.rows) == 1
    assert report.rows[0].realized == 0.0
    assert report.rows[0].planned == 0.0


@pytest.mark.asyncio
async def test_month_past_the_navigation_cap_is_still_served(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    """The 12-month bound is a navigation affordance, not a validation rule."""
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(20),
    )

    assert report.rows[0].budgeted == pytest.approx(1000.0)
    assert report.rows[0].planned == 0.0


# ---------------------------------------------------------------------------
# Recorded commitments only (D3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_future_projection_alone_contributes_nothing(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add(_rule(
        test_user, test_workspace, acc, test_categories[0].id, "700",
        _month(2).replace(day=10),
    ))
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(2),
    )

    assert report.rows[0].realized == 0.0
    assert report.rows[0].planned == 0.0


@pytest.mark.asyncio
async def test_the_same_occurrence_as_a_real_row_counts_exactly_once(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    """The rule and its materialized placeholder both exist — the amount must
    appear once, in `planned`."""
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    occurrence = _month(2).replace(day=10)
    session.add_all([
        _rule(test_user, test_workspace, acc, test_categories[0].id, "700", occurrence),
        _tx(test_user, acc, test_categories[0].id, "700", occurrence,
            status="planned", source="recurring"),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(2),
    )

    assert report.rows[0].planned == pytest.approx(700.0)
    assert report.rows[0].realized == 0.0


@pytest.mark.asyncio
async def test_past_projection_still_counts_as_realized(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    """Rules with `auto_generate=false` are projected rather than materialized.
    Dropping their past occurrences would lose real spending and break parity
    with /budgets on past months."""
    await create_budget(
        session, test_workspace.id, test_user.id,
        BudgetCreate(
            category_id=test_categories[0].id, amount=Decimal("1000"),
            month=_month(-6), is_recurring=True,
        ),
    )
    session.add(_rule(
        test_user, test_workspace, acc, test_categories[0].id, "400",
        _month(-1).replace(day=3), auto_generate=False,
    ))
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(-1),
    )

    assert report.rows[0].realized == pytest.approx(400.0)
    assert report.rows[0].planned == 0.0


# ---------------------------------------------------------------------------
# Past and current months
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unpromoted_planned_entry_in_a_past_month(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    await create_budget(
        session, test_workspace.id, test_user.id,
        BudgetCreate(
            category_id=test_categories[0].id, amount=Decimal("1000"),
            month=_month(-6), is_recurring=True,
        ),
    )
    session.add_all([
        _tx(test_user, acc, test_categories[0].id, "120", _month(-2).replace(day=8)),
        _tx(test_user, acc, test_categories[0].id, "80", _month(-2).replace(day=9),
            status="planned"),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(-2),
    )

    assert report.rows[0].realized == pytest.approx(120.0)
    assert report.rows[0].planned == pytest.approx(80.0)


@pytest.mark.asyncio
async def test_current_month_mixes_realized_and_planned(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    """A projection dated after today is excluded even in the current month.
    (When today is the last day of the month that occurrence falls outside the
    window and the exclusion is vacuous here — `test_future_projection_alone_
    contributes_nothing` covers it unconditionally.)"""
    today = date.today()
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add_all([
        _tx(test_user, acc, test_categories[0].id, "200", today),
        _tx(test_user, acc, test_categories[0].id, "150", today, status="planned"),
        _rule(test_user, test_workspace, acc, test_categories[0].id, "999",
              today + timedelta(days=1)),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(0),
    )

    assert report.rows[0].realized == pytest.approx(200.0)
    assert report.rows[0].planned == pytest.approx(150.0)


@pytest.mark.asyncio
async def test_out_of_budget_splits_realized_and_planned(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add_all([
        _tx(test_user, acc, test_categories[1].id, "60", _month(0).replace(day=1)),
        _tx(test_user, acc, test_categories[1].id, "90", _month(0).replace(day=2),
            status="planned"),
        # Uncategorized spending folds into the same bucket.
        _tx(test_user, acc, None, "10", _month(0).replace(day=3), status="planned"),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(0),
    )

    assert report.summary.out_of_budget == pytest.approx(60.0)
    assert report.summary.out_of_budget_planned == pytest.approx(100.0)
    assert [r.category_id for r in report.rows] == [test_categories[0].id]


@pytest.mark.asyncio
@pytest.mark.parametrize("include_planned", [False, True])
async def test_response_does_not_depend_on_the_preference(
    session: AsyncSession, test_user, test_workspace, test_categories, acc,
    include_planned,
):
    test_user.preferences = {**(test_user.preferences or {}),
                             "include_planned": include_planned}
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add_all([
        _tx(test_user, acc, test_categories[0].id, "200", _month(0).replace(day=2)),
        _tx(test_user, acc, test_categories[0].id, "300", _month(2).replace(day=2),
            status="planned"),
    ])
    await session.commit()

    current = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(0),
    )
    future = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(2),
    )

    assert (current.rows[0].realized, current.rows[0].planned) == (200.0, 0.0)
    assert (future.rows[0].realized, future.rows[0].planned) == (0.0, 300.0)


# ---------------------------------------------------------------------------
# Credit-card bill month
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["cash", "accrual"])
async def test_planned_instalment_lands_in_its_bill_month(
    session: AsyncSession, test_user, test_workspace, test_categories, acc, mode
):
    """`effective_bill_date` decides the reporting month in both accounting
    modes — the hand-corrected invoice wins, which is the whole point of the
    override."""
    await admin_service.set_app_setting(session, "credit_card_accounting_mode", mode)
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add(_tx(
        test_user, acc, test_categories[0].id, "500", _month(1).replace(day=28),
        status="planned", effective_bill_date=_month(2).replace(day=10),
    ))
    await session.commit()

    purchase_month = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(1),
    )
    bill_month = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month=_ym(2),
    )

    assert purchase_month.rows[0].planned == 0.0
    assert bill_month.rows[0].planned == pytest.approx(500.0)


# ---------------------------------------------------------------------------
# /budgets must not move
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_budgets_screen_keeps_its_own_semantics(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    """The report's status split must not leak into /budgets: there, `actual`
    still follows the preference, and still counts projections regardless of
    their date. `planned_scope=None` on every existing call site is what
    guarantees it — this test is the guard on that default.
    """
    today = date.today()
    await _recurring_envelope(session, test_workspace, test_user, test_categories[0])
    session.add_all([
        _tx(test_user, acc, test_categories[0].id, "200", today),
        _tx(test_user, acc, test_categories[0].id, "150", today, status="planned"),
    ])
    await session.commit()

    off = await get_budget_vs_actual(
        session, test_workspace.id, test_user.id, month=_month(0),
    )
    assert float(off[0].actual_amount) == pytest.approx(200.0)

    test_user.preferences = {**(test_user.preferences or {}), "include_planned": True}
    await session.commit()

    on = await get_budget_vs_actual(
        session, test_workspace.id, test_user.id, month=_month(0),
    )
    assert float(on[0].actual_amount) == pytest.approx(350.0)


# ---------------------------------------------------------------------------
# The forward bound
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_latest_month_without_commitments_is_the_current_month(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    session.add(_tx(test_user, acc, test_categories[0].id, "50", date.today()))
    await session.commit()

    assert await get_latest_planned_month(session, test_workspace.id) == _ym(0)


@pytest.mark.asyncio
async def test_latest_month_follows_the_furthest_commitment(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    session.add_all([
        _tx(test_user, acc, test_categories[0].id, "50", _month(1).replace(day=5),
            status="planned"),
        _tx(test_user, acc, test_categories[0].id, "50", _month(3).replace(day=5),
            status="planned"),
    ])
    await session.commit()

    assert await get_latest_planned_month(session, test_workspace.id) == _ym(3)


@pytest.mark.asyncio
async def test_latest_month_is_capped_at_twelve_months(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    session.add(_tx(
        test_user, acc, test_categories[0].id, "50", _month(30).replace(day=5),
        status="planned",
    ))
    await session.commit()

    assert await get_latest_planned_month(session, test_workspace.id) == _ym(12)


@pytest.mark.asyncio
async def test_latest_month_follows_the_bill_month_not_the_purchase_date(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    session.add(_tx(
        test_user, acc, test_categories[0].id, "50", _month(0).replace(day=28),
        status="planned", effective_bill_date=_month(2).replace(day=10),
    ))
    await session.commit()

    assert await get_latest_planned_month(session, test_workspace.id) == _ym(2)


@pytest.mark.asyncio
async def test_ignored_commitment_does_not_extend_the_bound(
    session: AsyncSession, test_user, test_workspace, test_categories, acc
):
    row = _tx(test_user, acc, test_categories[0].id, "50", _month(4).replace(day=5),
              status="planned")
    row.is_ignored = True
    session.add(row)
    await session.commit()

    assert await get_latest_planned_month(session, test_workspace.id) == _ym(0)


@pytest.mark.asyncio
async def test_bounds_endpoint_exposes_latest_month(client, auth_headers, test_categories):
    response = await client.get("/api/reports/bounds", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"earliest_month", "latest_month"}
    assert payload["latest_month"] == _ym(0)
