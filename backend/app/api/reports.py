import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.workspace_context import WorkspaceContext, current_workspace
from app.schemas.report import BudgetReportResponse, ReportBoundsResponse, ReportResponse
from app.services import report_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/net-worth", response_model=ReportResponse)
async def get_net_worth(
    months: int = Query(12, ge=1, le=24),
    interval: str = Query("monthly", pattern="^(daily|weekly|monthly|yearly)$"),
    account_ids: Optional[list[uuid.UUID]] = Query(None),
    asset_group_ids: Optional[list[uuid.UUID]] = Query(None),
    period: str | None = Query(None, pattern="^ytd$"),
    anchor_month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return await report_service.get_net_worth_report(
        session, ctx.workspace.id, ctx.user_id, months, interval, ctx.user.primary_currency,
        account_ids=account_ids, asset_group_ids=asset_group_ids, period=period,
        anchor_month=anchor_month,
    )


@router.get("/income-expenses", response_model=ReportResponse)
async def get_income_expenses(
    months: int = Query(12, ge=1, le=24),
    interval: str = Query("monthly", pattern="^(daily|weekly|monthly|yearly)$"),
    account_ids: Optional[list[uuid.UUID]] = Query(None),
    period: str | None = Query(None, pattern="^ytd$"),
    days: Optional[int] = Query(None, ge=1, le=730),
    anchor_month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    """`days` overrides `months` with an exact rolling window ending today."""
    return await report_service.get_income_expenses_report(
        session, ctx.workspace.id, ctx.user_id, months, interval, ctx.user.primary_currency,
        account_ids=account_ids, period=period, days=days, anchor_month=anchor_month,
    )


@router.get("/bounds", response_model=ReportBoundsResponse)
async def get_report_bounds(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    earliest = await report_service.get_earliest_transaction_month(session, ctx.workspace.id)
    return ReportBoundsResponse(earliest_month=earliest)


@router.get("/cash-flow", response_model=ReportResponse)
async def get_cash_flow(
    months: int = Query(6, ge=1, le=12),
    interval: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    baseline: bool = Query(False),
    account_ids: Optional[list[uuid.UUID]] = Query(None),
    anchor_month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return await report_service.get_cash_flow_report(
        session, ctx.workspace.id, ctx.user_id, months, interval, ctx.user.primary_currency,
        baseline=baseline, account_ids=account_ids, anchor_month=anchor_month,
    )


@router.get("/budget", response_model=BudgetReportResponse)
async def get_budget_report(
    months: int = Query(12, ge=1, le=24),
    period: str | None = Query(None, pattern="^ytd$"),
    # The month range is part of the pattern: `\d{2}` alone accepts "2026-13",
    # which reaches `_month_bounds` and raises instead of returning a 422.
    anchor_month: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    """Budgeted vs realized per category.

    No `account_ids`: budgets have no account dimension, so the frontend hides
    the tab under a Collection filter rather than comparing a filtered actual
    against a workspace-wide envelope. No `interval` either — the chart puts
    categories on the X axis, not time.
    """
    return await report_service.get_budget_report(
        session, ctx.workspace.id, ctx.user_id, months, ctx.user.primary_currency,
        period=period, anchor_month=anchor_month,
    )
