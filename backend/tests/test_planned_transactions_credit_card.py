"""Planned purchases and credit-card limit / bill assignment.

See planning/002-planned-transactions (T9). The distinguishing rule: a
planned card purchase consumes committed limit *from the moment it is
recorded*, not when its date arrives — a future instalment of a purchase
already made is committed today.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate
from app.services.credit_card_service import (
    compute_available_credit,
    compute_committed_credit,
)
from app.services.transaction_service import create_transaction


# ---------------------------------------------------------------------------
# compute_committed_credit
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "limit, balance, planned, expected",
    [
        (None, Decimal("-100"), Decimal("50"), None),          # no limit → unknown
        (Decimal("1000"), Decimal("0"), Decimal("0"), Decimal("1000")),
        (Decimal("1000"), Decimal("-200"), Decimal("0"), Decimal("800")),
        (Decimal("1000"), Decimal("-200"), Decimal("300"), Decimal("500")),
        # Planned beyond the limit is reported as negative rather than clamped:
        # "you have over-committed" is the honest answer.
        (Decimal("1000"), Decimal("-900"), Decimal("400"), Decimal("-300")),
        # A positive balance (credit on the card) does not add to the limit.
        (Decimal("1000"), Decimal("50"), Decimal("100"), Decimal("900")),
    ],
)
def test_compute_committed_credit(limit, balance, planned, expected):
    assert compute_committed_credit(limit, balance, planned) == expected


def test_committed_never_exceeds_available():
    limit, balance = Decimal("2000"), Decimal("-500")
    available = compute_available_credit(limit, balance)
    committed = compute_committed_credit(limit, balance, Decimal("250"))
    assert committed < available


# ---------------------------------------------------------------------------
# Bill assignment and the API surface
# ---------------------------------------------------------------------------


@pytest.fixture
async def card(session, test_user, test_workspace):
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Cartão", type="credit_card", balance=Decimal("0"), currency="BRL",
        credit_limit=Decimal("5000"), statement_close_day=20, payment_due_day=28,
    )
    session.add(account)
    await session.commit()
    return account


@pytest.mark.asyncio
async def test_planned_purchase_consumes_committed_limit_immediately(
    client, auth_headers, session, test_user, test_workspace, card
):
    """Dated three months out, committed today."""
    far_future = date.today() + timedelta(days=90)
    await create_transaction(
        session, test_workspace.id, test_user.id,
        TransactionCreate(
            description="Notebook (3/10)", amount=Decimal("450.00"),
            date=far_future, type="debit", account_id=card.id, status="planned",
        ),
    )

    resp = await client.get("/api/accounts", headers=auth_headers)
    assert resp.status_code == 200
    row = next(a for a in resp.json() if a["id"] == str(card.id))

    assert row["planned_amount"] == pytest.approx(450.0)
    assert row["committed_credit"] == pytest.approx(
        row["available_credit"] - 450.0
    )


@pytest.mark.asyncio
async def test_planned_row_does_not_move_card_balance(
    client, auth_headers, session, test_user, test_workspace, card
):
    """Committed limit moves; the drawn balance does not."""
    await create_transaction(
        session, test_workspace.id, test_user.id,
        TransactionCreate(
            description="Planned", amount=Decimal("450.00"),
            date=date.today() + timedelta(days=30), type="debit",
            account_id=card.id, status="planned",
        ),
    )

    resp = await client.get("/api/accounts", headers=auth_headers)
    row = next(a for a in resp.json() if a["id"] == str(card.id))
    assert row["current_balance"] == pytest.approx(0.0)
    assert row["available_credit"] == pytest.approx(5000.0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "purchase_day, expected_due",
    [
        (10, date(2025, 3, 28)),   # before close → this cycle
        (19, date(2025, 3, 28)),   # day before close → this cycle
        (20, date(2025, 4, 28)),   # ON the close day → next invoice (BR convention)
        (21, date(2025, 4, 28)),   # after close → next invoice
    ],
)
async def test_planned_purchase_lands_in_the_right_bill_cycle(
    session, test_user, test_workspace, card, purchase_day, expected_due
):
    """Reuses the existing apply_effective_date path — no new date logic."""
    txn = await create_transaction(
        session, test_workspace.id, test_user.id,
        TransactionCreate(
            description=f"Buy {purchase_day}", amount=Decimal("100.00"),
            date=date(2025, 3, purchase_day), type="debit",
            account_id=card.id, status="planned",
        ),
    )
    assert txn.status == "planned"
    assert txn.effective_date == expected_due


@pytest.mark.asyncio
async def test_planned_row_does_not_alter_a_closed_bill(
    client, auth_headers, session, test_user, test_workspace, card
):
    """The closed-bill carve-outs test `status == 'pending'` explicitly, so
    planned must not match them."""
    from app.models.credit_card_bill import CreditCardBill

    due = date.today().replace(day=1) - timedelta(days=5)
    bill = CreditCardBill(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=card.id, external_id="bill-1", due_date=due,
        total_amount=Decimal("300.00"), currency="BRL",
        minimum_payment=Decimal("60.00"),
    )
    real = Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=card.id, description="Real", amount=Decimal("300.00"),
        date=due - timedelta(days=10), effective_date=due, type="debit",
        source="manual", status="posted", currency="BRL", bill_id=bill.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add_all([bill, real])
    await session.commit()

    url = f"/api/accounts/{card.id}/summary?bill_id={bill.id}"
    before = (await client.get(url, headers=auth_headers)).json()

    session.add(Transaction(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        account_id=card.id, description="Planned into closed bill",
        amount=Decimal("999.00"), date=due - timedelta(days=8),
        effective_date=due, type="debit", source="manual", status="planned",
        currency="BRL", bill_id=bill.id, created_at=datetime.now(timezone.utc),
    ))
    await session.commit()

    after = (await client.get(url, headers=auth_headers)).json()
    assert after["monthly_expenses"] == before["monthly_expenses"]
