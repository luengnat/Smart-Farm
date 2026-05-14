"""Add levels column to farms table.

Revision ID: 004
Revises: 003
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("farms", sa.Column("levels", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("farms", "levels")
