"""Reclassify future-dated recurring placeholders as planned

Revision ID: 066
Revises: 065
Create Date: 2026-08-15

`generate_pending` materializes recurring occurrences into real transaction
rows, and `up_to` lets it write occurrences dated in the future so the
dashboard can pre-generate months the user navigates ahead to. Those rows
never set `status`, so they inherited the column default `posted` — booking
a charge that hasn't happened as already settled.

This reclassifies the rows already written that way.

Deliberately scoped to `source = 'recurring'`. Manually entered future-dated
rows are left alone: the user had no way to express planned-vs-realized when
they created them, so reclassifying would be guessing at intent.

The `status = 'posted'` guard keeps this idempotent and avoids touching any
row a user has already corrected by hand.
"""
import logging

import sqlalchemy as sa
from alembic import op

revision = "066"
down_revision = "065"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    result = op.get_bind().execute(
        sa.text(
            """
            UPDATE transactions
               SET status = 'planned'
             WHERE source = 'recurring'
               AND status = 'posted'
               AND date > CURRENT_DATE
            """
        )
    )
    logger.info(
        "066: reclassified %s future-dated recurring placeholder(s) to 'planned'",
        result.rowcount,
    )


def downgrade() -> None:
    result = op.get_bind().execute(
        sa.text(
            """
            UPDATE transactions
               SET status = 'posted'
             WHERE source = 'recurring'
               AND status = 'planned'
               AND date > CURRENT_DATE
            """
        )
    )
    logger.info(
        "066: reverted %s recurring placeholder(s) to 'posted'", result.rowcount
    )
