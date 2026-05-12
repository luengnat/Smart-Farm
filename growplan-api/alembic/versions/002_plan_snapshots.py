"""Add plan_snapshots table.

Revision ID: 002
Revises: 001
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plan_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_type", sa.String(length=20), nullable=False),
        sa.Column("grid_data", sa.JSON(), nullable=False),
        sa.Column("allocations", sa.JSON(), nullable=False),
        sa.Column("revenue", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_snapshots_plan_id", "plan_snapshots", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_snapshots_plan_id", table_name="plan_snapshots")
    op.drop_table("plan_snapshots")
