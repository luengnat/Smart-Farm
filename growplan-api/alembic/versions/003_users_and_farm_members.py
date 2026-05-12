"""Add users and farm_members tables.

Revision ID: 003
Revises: 002
Create Date: 2026-05-12
"""
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "farm_members",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("farm_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.Enum("owner", "manager", "viewer", name="memberrole"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "farm_id", name="uq_user_farm"),
    )

    # Create a default system user and assign all existing farms
    default_email = os.environ.get("GP_DEFAULT_USER_EMAIL", "admin@growplan.local")
    op.execute(
        sa.text(
            "INSERT INTO users (email, hashed_password, display_name) "
            "VALUES (:email, :hash, :name)"
        ).bindparams(
            email=default_email,
            hash="$2b$12$_placeholder_not_a_real_hash_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            name="System Admin",
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO farm_members (user_id, farm_id, role) "
            "SELECT u.id, f.id, 'owner' FROM users u, farms f "
            "WHERE u.email = :email"
        ).bindparams(email=default_email)
    )


def downgrade() -> None:
    op.drop_table("farm_members")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
