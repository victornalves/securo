"""Tests for the shared aggregation predicates.

These fragments decide what counts as spending everywhere in the app, so the
status axis has to compose with the pre-existing exclusions rather than
replace them. See planning/002-planned-transactions (T3).
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.services._query_filters import (
    counts_as_pnl,
    counts_as_realized,
    counts_as_user_pnl,
)


@pytest.fixture
def _acc_factory():
    def _make(user_id):
        return Account(
            id=uuid.uuid4(), user_id=user_id, name="Filters",
            type="checking", balance=Decimal("0"), currency="BRL",
        )
    return _make


async def _add(session, user_id, account_id, *, status="posted", **kw):
    txn = Transaction(
        id=uuid.uuid4(), user_id=user_id, account_id=account_id,
        description=kw.pop("description", f"tx-{status}"),
        amount=Decimal("100"), date=date.today(), type="debit",
        source=kw.pop("source", "manual"), currency="BRL", status=status,
        created_at=datetime.now(timezone.utc), **kw,
    )
    session.add(txn)
    await session.commit()
    return txn


async def _descriptions(session, predicate):
    rows = await session.execute(select(Transaction.description).where(predicate))
    return {r[0] for r in rows.all()}


@pytest.mark.asyncio
async def test_planned_excluded_by_default(session: AsyncSession, test_user, _acc_factory):
    account = _acc_factory(test_user.id)
    session.add(account)
    await session.commit()

    await _add(session, test_user.id, account.id, status="posted", description="p")
    await _add(session, test_user.id, account.id, status="pending", description="n")
    await _add(session, test_user.id, account.id, status="planned", description="l")

    assert await _descriptions(session, counts_as_pnl()) == {"p", "n"}
    assert await _descriptions(session, counts_as_user_pnl()) == {"p", "n"}


@pytest.mark.asyncio
async def test_planned_admitted_when_requested(session: AsyncSession, test_user, _acc_factory):
    account = _acc_factory(test_user.id)
    session.add(account)
    await session.commit()

    await _add(session, test_user.id, account.id, status="posted", description="p")
    await _add(session, test_user.id, account.id, status="planned", description="l")

    assert await _descriptions(session, counts_as_pnl(True)) == {"p", "l"}
    assert await _descriptions(session, counts_as_user_pnl(True)) == {"p", "l"}


@pytest.mark.asyncio
async def test_counts_as_realized_never_admits_planned(
    session: AsyncSession, test_user, _acc_factory
):
    """No parameter, by design — balance is never toggle-governed."""
    account = _acc_factory(test_user.id)
    session.add(account)
    await session.commit()

    await _add(session, test_user.id, account.id, status="posted", description="p")
    await _add(session, test_user.id, account.id, status="pending", description="n")
    await _add(session, test_user.id, account.id, status="planned", description="l")

    assert await _descriptions(session, counts_as_realized()) == {"p", "n"}


@pytest.mark.asyncio
@pytest.mark.parametrize("include_planned", [False, True])
async def test_status_axis_composes_with_existing_exclusions(
    session: AsyncSession, test_user, _acc_factory, include_planned
):
    """The pre-existing exclusions must behave identically in both modes —
    the status axis narrows the set, it does not replace the other rules."""
    account = _acc_factory(test_user.id)
    ignored_cat = Category(
        id=uuid.uuid4(), user_id=test_user.id, name="Ignored",
        icon="tag", color="#000", is_system=False, is_ignored=True,
    )
    transfer_cat = Category(
        id=uuid.uuid4(), user_id=test_user.id, name="Transferish",
        icon="tag", color="#000", is_system=False, treat_as_transfer=True,
    )
    session.add_all([account, ignored_cat, transfer_cat])
    await session.commit()

    await _add(session, test_user.id, account.id, description="keep")
    await _add(session, test_user.id, account.id, description="paired",
               transfer_pair_id=uuid.uuid4())
    await _add(session, test_user.id, account.id, description="ignored-row",
               is_ignored=True)
    await _add(session, test_user.id, account.id, description="ignored-cat",
               category_id=ignored_cat.id)
    await _add(session, test_user.id, account.id, description="transfer-cat",
               category_id=transfer_cat.id)
    await _add(session, test_user.id, account.id, description="settlement-debit",
               source="settlement")
    # Planned, but otherwise perfectly countable.
    await _add(session, test_user.id, account.id, description="planned-keep",
               status="planned")

    found = await _descriptions(session, counts_as_pnl(include_planned))
    expected = {"keep"} | ({"planned-keep"} if include_planned else set())
    assert found == expected


@pytest.mark.asyncio
async def test_user_pnl_still_drops_settlement_credits(
    session: AsyncSession, test_user, _acc_factory
):
    """counts_as_user_pnl's extra rule survives the new parameter."""
    account = _acc_factory(test_user.id)
    session.add(account)
    await session.commit()

    await _add(session, test_user.id, account.id, description="keep")
    settlement_credit = Transaction(
        id=uuid.uuid4(), user_id=test_user.id, account_id=account.id,
        description="settlement-credit", amount=Decimal("50"),
        date=date.today(), type="credit", source="settlement", currency="BRL",
        created_at=datetime.now(timezone.utc),
    )
    session.add(settlement_credit)
    await session.commit()

    assert await _descriptions(session, counts_as_pnl()) == {"keep", "settlement-credit"}
    assert await _descriptions(session, counts_as_user_pnl()) == {"keep"}
