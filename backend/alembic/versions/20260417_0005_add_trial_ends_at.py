"""add trial_ends_at to users

Revision ID: 20260417_0005
Revises: 20260417_0004
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "20260417_0005"
down_revision = "20260417_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "trial_ends_at")
