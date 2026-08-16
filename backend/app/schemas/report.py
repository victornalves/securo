import uuid

from pydantic import BaseModel


class ReportBreakdown(BaseModel):
    key: str
    label: str
    value: float
    color: str


class ReportSummary(BaseModel):
    primary_value: float
    change_amount: float
    change_percent: float | None
    breakdowns: list[ReportBreakdown]


class ReportCompositionItem(BaseModel):
    key: str
    label: str
    value: float
    color: str
    group: str


class ReportDataPoint(BaseModel):
    date: str
    value: float
    breakdowns: dict[str, float]
    change: float | None = None
    composition: list[ReportCompositionItem] = []


class ReportMeta(BaseModel):
    type: str
    series_keys: list[str]
    currency: str
    interval: str
    forecast_start_date: str | None = None
    baseline_active: bool = False
    baseline_lookback_days: int | None = None


class CategoryTrendItem(BaseModel):
    key: str
    label: str
    color: str
    total: float
    group: str
    series: list[ReportDataPoint]


class ReportResponse(BaseModel):
    summary: ReportSummary
    trend: list[ReportDataPoint]
    meta: ReportMeta
    composition: list[ReportCompositionItem] = []
    category_trend: list[CategoryTrendItem] = []


class ReportBoundsResponse(BaseModel):
    earliest_month: str | None


class BudgetReportRow(BaseModel):
    category_id: uuid.UUID
    category_name: str
    category_icon: str
    category_color: str
    group_name: str | None = None
    budgeted: float          # sum of each month's effective envelope in the window
    realized: float          # spending over the window, /budgets semantics
    difference: float        # budgeted - realized; positive = room left
    percentage_used: float | None   # realized / budgeted * 100; None when budgeted == 0
    months_in_window: int
    months_budgeted: int


class BudgetReportSummary(BaseModel):
    budgeted: float
    realized: float          # budgeted categories only
    balance: float           # budgeted - realized
    out_of_budget: float


class BudgetReportMeta(BaseModel):
    currency: str
    start_date: str          # YYYY-MM-DD, inclusive
    end_date: str            # YYYY-MM-DD, inclusive
    months_in_window: int
    anchor_month: str | None


class BudgetReportResponse(BaseModel):
    rows: list[BudgetReportRow]
    summary: BudgetReportSummary
    meta: BudgetReportMeta
