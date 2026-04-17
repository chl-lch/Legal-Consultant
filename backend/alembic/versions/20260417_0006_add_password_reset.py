"""add password reset fields to users

Revision ID: 20260417_0006
Revises: 20260417_0005
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "20260417_0006"
down_revision = "20260417_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("reset_token", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("reset_token_expires", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_reset_token", "users", ["reset_token"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_reset_token", table_name="users")
    op.drop_column("users", "reset_token_expires")
    op.drop_column("users", "reset_token")
