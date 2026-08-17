"""List filtering by state, and the overdue-planned surface.

See planning/002-planned-transactions (T10). The load-bearing constraint is
spec D3: the include-planned *preference* governs computed figures and must
never change what a list contains.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User


async def _set_include_planned(session, user: User, value: bool) -> None:
    prefs = dict(user.preferences or {})
    prefs["include_planned"] = value
    user.preferences = prefs
    await session.commit()


@pytest.fixture
async def acc(session, test_user, test_workspace):
    account = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="List Acc", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(account)
    await session.commit()
    return account


async def _add(session, user, workspace_id, account, desc, when, status):
    txn = Transaction(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace_id,
        account_id=account.id, description=desc, amount=Decimal("100"),
        date=when, effective_date=when, type="debit", source="manual",
        status=status, currency="BRL", created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    return txn


@pytest.fixture
async def seeded(session, test_user, test_workspace, acc):
    today = date.today()
    await _add(session, test_user, test_workspace.id, acc, "posted-row", today, "posted")
    await _add(session, test_user, test_workspace.id, acc, "pending-row", today, "pending")
    await _add(session, test_user, test_workspace.id, acc, "planned-future",
               today + timedelta(days=5), "planned")
    await _add(session, test_user, test_workspace.id, acc, "planned-overdue",
               today - timedelta(days=5), "planned")
    return acc


def _descriptions(payload):
    return {i["description"] for i in payload["items"]}


@pytest.mark.asyncio
async def test_filter_by_single_status(client, auth_headers, seeded):
    resp = await client.get("/api/transactions?status=planned", headers=auth_headers)
    assert resp.status_code == 200
    assert _descriptions(resp.json()) == {"planned-future", "planned-overdue"}


@pytest.mark.asyncio
async def test_filter_by_multiple_statuses(client, auth_headers, seeded):
    resp = await client.get(
        "/api/transactions?status=posted&status=pending", headers=auth_headers
    )
    assert _descriptions(resp.json()) == {"posted-row", "pending-row"}


@pytest.mark.asyncio
async def test_omitting_status_returns_everything(client, auth_headers, seeded):
    resp = await client.get("/api/transactions", headers=auth_headers)
    assert _descriptions(resp.json()) == {
        "posted-row", "pending-row", "planned-future", "planned-overdue",
    }


@pytest.mark.asyncio
async def test_list_contents_identical_in_both_preference_states(
    client, auth_headers, session, test_user, seeded
):
    """The D3 guard. If this fails, the preference has leaked into a list
    query and the two concerns are no longer separable."""
    off = await client.get("/api/transactions", headers=auth_headers)
    off_items = _descriptions(off.json())
    off_total = off.json()["total"]

    await _set_include_planned(session, test_user, True)

    on = await client.get("/api/transactions", headers=auth_headers)
    assert _descriptions(on.json()) == off_items
    assert on.json()["total"] == off_total


# ---------------------------------------------------------------------------
# Overdue planned
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_overdue_returns_only_past_dated_planned(client, auth_headers, seeded):
    resp = await client.get("/api/transactions/planned/overdue", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert {i["description"] for i in body["items"]} == {"planned-overdue"}


@pytest.mark.asyncio
async def test_overdue_excludes_today(
    client, auth_headers, session, test_user, test_workspace, acc
):
    """A commitment dated today has not been missed yet."""
    await _add(session, test_user, test_workspace.id, acc, "due-today",
               date.today(), "planned")

    resp = await client.get("/api/transactions/planned/overdue", headers=auth_headers)
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_overdue_ignores_other_statuses(
    client, auth_headers, session, test_user, test_workspace, acc
):
    await _add(session, test_user, test_workspace.id, acc, "old-posted",
               date.today() - timedelta(days=20), "posted")
    await _add(session, test_user, test_workspace.id, acc, "old-pending",
               date.today() - timedelta(days=20), "pending")

    resp = await client.get("/api/transactions/planned/overdue", headers=auth_headers)
    assert resp.json()["count"] == 0


@pytest.mark.asyncio
async def test_overdue_is_workspace_scoped(
    client, auth_headers, session, test_user, test_workspace, acc, seeded
):
    """A planned row in another workspace must not appear."""
    from app.models.workspace import Workspace

    other_ws = Workspace(id=uuid.uuid4(), name="Other")
    session.add(other_ws)
    await session.commit()

    other_acc = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=other_ws.id,
        name="Other Acc", type="checking", balance=Decimal("0"), currency="BRL",
    )
    session.add(other_acc)
    await session.commit()

    await _add(session, test_user, other_ws.id, other_acc, "other-ws-planned",
               date.today() - timedelta(days=3), "planned")

    resp = await client.get("/api/transactions/planned/overdue", headers=auth_headers)
    assert {i["description"] for i in resp.json()["items"]} == {"planned-overdue"}
