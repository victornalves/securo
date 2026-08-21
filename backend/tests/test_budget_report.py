"""Tests for the budget report (spec 003).

Aggregation rules are exercised against `get_budget_window_totals` with an
explicit month list, so they stay deterministic; window resolution is
exercised against `get_budget_report`, whose rolling ranges always end today.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.transaction import Transaction
from app.schemas.budget import BudgetCreate
from app.services.budget_service import (
    create_budget,
    get_budget_vs_actual,
    get_budget_window_totals,
)
from app.services.report_service import _report_start_date, get_budget_report


@pytest_asyncio.fixture
async def budget_account(session: AsyncSession, test_user) -> Account:
    account = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="BudgetReportAcc",
        type="checking",
        balance=Decimal("10000"),
        currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


async def _budget(session, workspace, user, category, amount, month, is_recurring=False):
    return await create_budget(
        session, workspace.id, user.id,
        BudgetCreate(
            category_id=category.id,
            amount=Decimal(amount),
            month=month,
            is_recurring=is_recurring,
        ),
    )


def _spend(user, account, category_id, amount, on: date) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        account_id=account.id,
        category_id=category_id,
        description="spend",
        amount=Decimal(amount),
        date=on,
        type="debit",
        source="manual",
        created_at=datetime.now(timezone.utc),
    )


def _months(*pairs: tuple[int, int]) -> list[date]:
    return [date(year, month, 1) for year, month in pairs]


# ---------------------------------------------------------------------------
# Parity with /budgets — the guarantee the whole design rests on
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_realized_and_budgeted_match_budgets_screen(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    """Same month through /budgets and through the report: identical numbers."""
    await _budget(session, test_workspace, test_user, test_categories[0], "500", date(2025, 3, 1))
    await _budget(
        session, test_workspace, test_user, test_categories[1], "300",
        date(2025, 1, 1), is_recurring=True,
    )
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "100", date(2025, 3, 10)),
        _spend(test_user, budget_account, test_categories[1].id, "50", date(2025, 3, 12)),
        _spend(test_user, budget_account, test_categories[2].id, "70", date(2025, 3, 15)),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )
    comparisons = await get_budget_vs_actual(
        session, test_workspace.id, test_user.id, month=date(2025, 3, 1),
    )
    by_category = {c.category_id: c for c in comparisons}

    assert len(report.rows) == 2
    for row in report.rows:
        comparison = by_category[row.category_id]
        assert row.realized == pytest.approx(float(comparison.actual_amount))
        assert row.budgeted == pytest.approx(float(comparison.budget_amount))
        assert row.percentage_used == pytest.approx(comparison.percentage_used)

    # The unbudgeted category's spending is the out-of-budget column.
    assert report.summary.out_of_budget == pytest.approx(70.0)


@pytest.mark.asyncio
async def test_month_override_beats_recurring_default(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    await _budget(
        session, test_workspace, test_user, test_categories[0], "300",
        date(2025, 1, 1), is_recurring=True,
    )
    await _budget(session, test_workspace, test_user, test_categories[0], "900", date(2025, 3, 1))

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert len(report.rows) == 1
    assert report.rows[0].budgeted == pytest.approx(900.0)
    assert report.rows[0].months_budgeted == 1
    assert report.rows[0].months_in_window == 1


# ---------------------------------------------------------------------------
# Multi-month aggregation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_month_without_envelope_counts_as_zero(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    """Budgeted in 3 of 6 months: envelope sums those 3, spending covers all 6."""
    for month in (date(2025, 1, 1), date(2025, 2, 1), date(2025, 3, 1)):
        await _budget(session, test_workspace, test_user, test_categories[0], "400", month)
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "100", date(2025, m, 10))
        for m in range(1, 7)
    ])
    await session.commit()

    rows, out_of_budget, _ = await get_budget_window_totals(
        session, test_workspace.id, test_user.id,
        _months((2025, 1), (2025, 2), (2025, 3), (2025, 4), (2025, 5), (2025, 6)),
        date(2025, 1, 1), date(2025, 7, 1),
    )

    assert len(rows) == 1
    assert rows[0].budgeted == Decimal("1200")
    assert rows[0].months_budgeted == 3
    assert rows[0].realized == Decimal("600")
    assert out_of_budget == Decimal("0")


@pytest.mark.asyncio
async def test_envelope_change_tracks_month_by_month(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    """800 until April, 1000 from May: the window sums each month's own amount."""
    await _budget(
        session, test_workspace, test_user, test_categories[0], "800",
        date(2025, 1, 1), is_recurring=True,
    )
    await _budget(
        session, test_workspace, test_user, test_categories[0], "1000",
        date(2025, 5, 1), is_recurring=True,
    )

    rows, _, _ = await get_budget_window_totals(
        session, test_workspace.id, test_user.id,
        _months((2025, 1), (2025, 2), (2025, 3), (2025, 4), (2025, 5), (2025, 6)),
        date(2025, 1, 1), date(2025, 7, 1),
    )

    assert rows[0].budgeted == Decimal("5200")  # 4 × 800 + 2 × 1000, not 6 × 1000
    assert rows[0].months_budgeted == 6


# ---------------------------------------------------------------------------
# Row membership and the out-of-budget bucket
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zero_and_missing_envelopes_are_not_rows(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    """An explicit 0 envelope is indistinguishable from none: both fall out."""
    await _budget(session, test_workspace, test_user, test_categories[0], "0", date(2025, 3, 1))
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "120", date(2025, 3, 10)),
        _spend(test_user, budget_account, test_categories[1].id, "80", date(2025, 3, 11)),
    ])
    await session.commit()

    rows, out_of_budget, _ = await get_budget_window_totals(
        session, test_workspace.id, test_user.id,
        _months((2025, 3)), date(2025, 3, 1), date(2025, 4, 1),
    )

    assert rows == []
    assert out_of_budget == Decimal("200")


@pytest.mark.asyncio
async def test_out_of_budget_includes_uncategorized_spending(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    await _budget(session, test_workspace, test_user, test_categories[0], "500", date(2025, 3, 1))
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "100", date(2025, 3, 10)),
        _spend(test_user, budget_account, test_categories[1].id, "60", date(2025, 3, 11)),
        _spend(test_user, budget_account, None, "40", date(2025, 3, 12)),
    ])
    await session.commit()

    rows, out_of_budget, _ = await get_budget_window_totals(
        session, test_workspace.id, test_user.id,
        _months((2025, 3)), date(2025, 3, 1), date(2025, 4, 1),
    )

    assert len(rows) == 1
    assert rows[0].realized == Decimal("100")
    assert out_of_budget == Decimal("100")  # 60 unbudgeted + 40 uncategorized


@pytest.mark.asyncio
async def test_budgeted_category_without_spending_is_kept(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    await _budget(session, test_workspace, test_user, test_categories[0], "500", date(2025, 3, 1))

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert len(report.rows) == 1
    assert report.rows[0].realized == 0.0
    assert report.rows[0].budgeted == pytest.approx(500.0)
    assert report.rows[0].difference == pytest.approx(500.0)
    assert report.rows[0].percentage_used == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_rows_ordered_by_realized_descending(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    for category in test_categories[:3]:
        await _budget(session, test_workspace, test_user, category, "1000", date(2025, 3, 1))
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "50", date(2025, 3, 10)),
        _spend(test_user, budget_account, test_categories[1].id, "300", date(2025, 3, 10)),
        _spend(test_user, budget_account, test_categories[2].id, "150", date(2025, 3, 10)),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert [row.realized for row in report.rows] == [300.0, 150.0, 50.0]


@pytest.mark.asyncio
async def test_period_without_budgets_is_empty_but_keeps_out_of_budget(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    session.add(_spend(test_user, budget_account, test_categories[0].id, "90", date(2025, 3, 10)))
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert report.rows == []
    assert report.summary.budgeted == 0.0
    assert report.summary.realized == 0.0
    assert report.summary.balance == 0.0
    assert report.summary.out_of_budget == pytest.approx(90.0)


@pytest.mark.asyncio
async def test_summary_balance_counts_budgeted_categories_only(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    await _budget(session, test_workspace, test_user, test_categories[0], "500", date(2025, 3, 1))
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "200", date(2025, 3, 10)),
        _spend(test_user, budget_account, test_categories[1].id, "999", date(2025, 3, 11)),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert report.summary.budgeted == pytest.approx(500.0)
    assert report.summary.realized == pytest.approx(200.0)
    assert report.summary.balance == pytest.approx(300.0)  # unaffected by the 999
    assert report.summary.out_of_budget == pytest.approx(999.0)


# ---------------------------------------------------------------------------
# Window resolution
# ---------------------------------------------------------------------------


def _calendar_months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


@pytest.mark.asyncio
async def test_anchor_month_scopes_to_that_month(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert report.meta.anchor_month == "2025-03"
    assert report.meta.start_date == "2025-03-01"
    assert report.meta.end_date == "2025-03-31"
    assert report.meta.months_in_window == 1


@pytest.mark.asyncio
async def test_ytd_starts_on_january_first(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    today = date.today()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", period="ytd",
    )

    assert report.meta.start_date == date(today.year, 1, 1).isoformat()
    assert report.meta.end_date == today.isoformat()
    assert report.meta.months_in_window == today.month
    assert report.meta.anchor_month is None


@pytest.mark.asyncio
async def test_month_list_follows_resolved_start_not_the_month_count(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    """`_report_start_date` approximates a month as 30 days, so a 6M window can
    span seven calendar months — the envelope span must follow the resolved
    start date rather than the requested count."""
    today = date.today()
    expected_start = _report_start_date(today, 6)

    report = await get_budget_report(session, test_workspace.id, test_user.id, 6, "BRL")

    assert report.meta.start_date == expected_start.isoformat()
    assert report.meta.months_in_window == _calendar_months_between(expected_start, today)


@pytest.mark.asyncio
async def test_envelopes_cover_every_month_of_a_rolling_window(
    session: AsyncSession, test_user, test_workspace, test_categories
):
    """A recurring envelope old enough to cover the whole window is counted once
    per calendar month in it — including the partial current month, at full
    value (no pro-rating, by design)."""
    today = date.today()
    await _budget(
        session, test_workspace, test_user, test_categories[0], "100",
        date(today.year - 3, 1, 1), is_recurring=True,
    )

    report = await get_budget_report(session, test_workspace.id, test_user.id, 6, "BRL")

    months = report.meta.months_in_window
    assert report.rows[0].months_budgeted == months
    assert report.rows[0].budgeted == pytest.approx(100.0 * months)


# ---------------------------------------------------------------------------
# API surface
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_budget_report_endpoint_returns_payload(client, auth_headers, test_categories):
    response = await client.get("/api/reports/budget", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"rows", "summary", "meta"}
    assert set(payload["summary"]) == {
        "budgeted", "realized", "planned", "balance", "committed_balance",
        "out_of_budget", "out_of_budget_planned",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"anchor_month": "2026-13"},
        {"anchor_month": "garbage"},
        {"months": 0},
        {"months": 25},
        {"period": "mtd"},
    ],
)
async def test_budget_report_endpoint_rejects_bad_params(client, auth_headers, params):
    response = await client.get("/api/reports/budget", params=params, headers=auth_headers)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_budget_report_endpoint_accepts_anchor_month(client, auth_headers):
    response = await client.get(
        "/api/reports/budget", params={"anchor_month": "2025-03"}, headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["meta"]["anchor_month"] == "2025-03"
    assert response.json()["meta"]["months_in_window"] == 1


@pytest.mark.asyncio
async def test_budget_report_endpoint_has_no_account_filter(client, auth_headers):
    """`account_ids` is not part of the contract — budgets have no account
    dimension, so an unknown query param must simply be ignored, never used."""
    response = await client.get(
        "/api/reports/budget", params={"account_ids": str(uuid.uuid4())}, headers=auth_headers,
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_previous_month_spending_stays_out_of_the_window(
    session: AsyncSession, test_user, test_workspace, test_categories, budget_account
):
    await _budget(session, test_workspace, test_user, test_categories[0], "500", date(2025, 3, 1))
    session.add_all([
        _spend(test_user, budget_account, test_categories[0].id, "100", date(2025, 3, 10)),
        _spend(
            test_user, budget_account, test_categories[0].id, "999",
            date(2025, 3, 1) - timedelta(days=1),
        ),
    ])
    await session.commit()

    report = await get_budget_report(
        session, test_workspace.id, test_user.id, 12, "BRL", anchor_month="2025-03",
    )

    assert report.rows[0].realized == pytest.approx(100.0)
