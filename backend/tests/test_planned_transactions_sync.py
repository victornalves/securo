"""Sync must never touch a planned transaction.

See planning/002-planned-transactions (T7). Decision D2 makes promotion a
deliberate user action; the risk is that the existing twin-matcher performs
it by accident, since its load-bearing signal is "the statuses differ".
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.transaction import Transaction
from app.providers.base import TransactionData
from app.services.connection_service import _find_synced_duplicate


@pytest.fixture
async def acc(session, test_user, test_workspace, test_connection):
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        connection_id=test_connection.id, external_id="acc-sync-1",
        name="Synced", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


async def _add(session, user, workspace_id, account, *, status, source,
               external_id=None, description="MERCADO LIVRE COMPRA"):
    txn = Transaction(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace_id,
        account_id=account.id, description=description,
        amount=Decimal("250.00"), date=date(2025, 5, 12),
        effective_date=date(2025, 5, 12), type="debit", source=source,
        status=status, currency="BRL", external_id=external_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    return txn


def _incoming(description="MERCADO LIVRE COMPRA"):
    """An incoming posted row that matches on every field the twin-matcher
    keys on — same account, date, amount, type, and a description well above
    the 0.7 similarity threshold."""
    return TransactionData(
        external_id="new-external-id",
        description=description,
        amount=Decimal("250.00"),
        date=date(2025, 5, 12),
        type="debit",
        status="posted",
    )


@pytest.mark.asyncio
async def test_planned_row_is_not_matched_as_a_sync_twin(
    session, test_user, test_workspace, acc
):
    """The trap: `status != txn_data.status` is satisfied by planned≠posted.

    Guarded with `source='sync'` so the row is a candidate on every other
    axis — only the status guard can exclude it.
    """
    planned = await _add(session, test_user, test_workspace.id, acc,
                         status="planned", source="sync", external_id="old-id")

    assert await _find_synced_duplicate(session, acc.id, _incoming()) is None

    await session.refresh(planned)
    assert planned.status == "planned"
    assert planned.external_id == "old-id"


@pytest.mark.asyncio
async def test_manual_planned_row_is_not_matched(
    session, test_user, test_workspace, acc
):
    """A hand-entered commitment: excluded by source *and* by status."""
    planned = await _add(session, test_user, test_workspace.id, acc,
                         status="planned", source="manual")

    assert await _find_synced_duplicate(session, acc.id, _incoming()) is None

    await session.refresh(planned)
    assert planned.status == "planned"


@pytest.mark.asyncio
async def test_pending_twin_is_still_matched(
    session, test_user, test_workspace, acc
):
    """The guard must not break the behaviour it sits next to — a genuine
    pending→posted twin still reconciles."""
    pending = await _add(session, test_user, test_workspace.id, acc,
                         status="pending", source="sync", external_id="old-id")

    found = await _find_synced_duplicate(session, acc.id, _incoming())
    assert found is not None
    assert found.id == pending.id


@pytest.mark.asyncio
async def test_planned_installment_is_not_matched_by_fingerprint(
    session, test_user, test_workspace, acc
):
    """Path 1 keys on the instalment fingerprint and skips the description
    check entirely — a planned instalment is exactly the shape it looks for."""
    txn = Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=acc.id, description="Notebook (3/10)",
        amount=Decimal("450.00"), date=date(2025, 5, 12),
        effective_date=date(2025, 5, 12), type="debit", source="sync",
        status="planned", currency="BRL", external_id="old-id",
        installment_purchase_date=date(2025, 3, 12),
        installment_number=3, total_installments=10,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()

    incoming = TransactionData(
        external_id="new-id", description="Notebook 3/10",
        amount=Decimal("450.00"), date=date(2025, 5, 12), type="debit",
        status="posted",
        installment_purchase_date=date(2025, 3, 12),
        installment_number=3, total_installments=10,
    )
    assert await _find_synced_duplicate(session, acc.id, incoming) is None
