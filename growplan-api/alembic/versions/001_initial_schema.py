"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- farms ---
    op.create_table(
        "farms",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("location", sa.String(length=100), nullable=True),
        sa.Column("rows", sa.Integer(), nullable=False),
        sa.Column("columns", sa.Integer(), nullable=False),
        sa.Column("growing_system", sa.String(length=50), nullable=False, server_default="hydroponic"),
        sa.Column("nursery_tray_count", sa.Integer(), nullable=False),
        sa.Column("nursery_tray_cells", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("nursery_buffer_pct", sa.Float(), nullable=False, server_default="10.0"),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- crops ---
    op.create_table(
        "crops",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("icon", sa.String(length=10), nullable=False),
        sa.Column("accent", sa.String(length=7), nullable=False),
        sa.Column("weeks_on_panel", sa.Integer(), nullable=False),
        sa.Column("nursery_lead_weeks", sa.Integer(), nullable=False),
        sa.Column("yield_per_grid", sa.Float(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        sa.Column("seedlings_per_grid", sa.Integer(), nullable=False),
        sa.Column("tray_cell_count", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("germination_rate", sa.Float(), nullable=False, server_default="0.95"),
        sa.Column("prefers_edge", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("edge_weight", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("neighbor_bonus", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("nutrient_cost_per_grid_week", sa.Float(), nullable=False, server_default="0.10"),
        sa.Column("cost_per_seedling", sa.Float(), nullable=False, server_default="0.02"),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- plans ---
    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("farm_id", sa.Integer(), nullable=False),
        sa.Column("horizon_weeks", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="solving"),
        sa.Column("goal_priority", sa.String(length=30), nullable=False, server_default="maximize-revenue"),
        sa.Column("selected_crops", sa.JSON(), nullable=False),
        sa.Column("goal_commitments", sa.JSON(), nullable=True),
        sa.Column("current_week", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total_grids", sa.Integer(), nullable=True),
        sa.Column("revenue_total", sa.Float(), nullable=True),
        sa.Column("revenue_max", sa.Float(), nullable=True),
        sa.Column("revenue_efficiency", sa.Float(), nullable=True),
        sa.Column("revenue_opportunity_cost", sa.Float(), nullable=True),
        sa.Column("revenue_gap", sa.Float(), nullable=True),
        sa.Column("solver_status", sa.String(length=30), nullable=True),
        sa.Column("solver_time_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"]),
    )

    # --- grid_cells ---
    op.create_table(
        "grid_cells",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("cell_index", sa.Integer(), nullable=False),
        sa.Column("crop_id", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="planned"),
        sa.Column("week_started", sa.Integer(), nullable=True),
        sa.Column("week_harvest_expected", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    )

    # --- allocations ---
    op.create_table(
        "allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("crop_id", sa.String(length=50), nullable=False),
        sa.Column("grids_allocated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sustainable_kg_per_week", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("revenue_per_week", sa.Float(), nullable=False, server_default="0.0"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    )

    # --- nursery_batches ---
    op.create_table(
        "nursery_batches",
        sa.Column("id", sa.String(length=50), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("crop_id", sa.String(length=50), nullable=False),
        sa.Column("seed_week", sa.Integer(), nullable=False),
        sa.Column("transplant_week", sa.Integer(), nullable=False),
        sa.Column("seedling_count", sa.Integer(), nullable=False),
        sa.Column("tray_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="planned"),
        sa.PrimaryKeyConstraint("id", "plan_id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    )

    # --- disruptions ---
    op.create_table(
        "disruptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("grid_indexes", sa.JSON(), nullable=False),
        sa.Column("crop_id", sa.String(length=50), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    )

    # --- actions ---
    op.create_table(
        "actions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("crop_id", sa.String(length=50), nullable=True),
        sa.Column("grid_indexes", sa.JSON(), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("revenue_impact", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("batch_id", sa.String(length=50), nullable=True),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
    )


def downgrade() -> None:
    op.drop_table("actions")
    op.drop_table("disruptions")
    op.drop_table("nursery_batches")
    op.drop_table("allocations")
    op.drop_table("grid_cells")
    op.drop_table("plans")
    op.drop_table("crops")
    op.drop_table("farms")
