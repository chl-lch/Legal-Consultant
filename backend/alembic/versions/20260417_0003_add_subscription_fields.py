"""add subscription_status and stripe fields to users

Revision ID: 20260417_0003
Revises: 20260416_0002
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260417_0003"
down_revision = "20260416_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum type first
    subscription_status = postgresql.ENUM(
        "none", "trialing", "active", "past_due", "cancelled",
        name="subscription_status",
        create_type=False,
    )
    postgresql.ENUM(
        "none", "trialing", "active", "past_due", "cancelled",
        name="subscription_status",
    ).create(op.get_bind(), checkfirst=True)

    op.add_column("users", sa.Column(
        "subscription_status",
        subscription_status,
        nullable=False,
        server_default="none",
    ))
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))
    op.create_index("ix_users_stripe_customer_id", "users", ["stripe_customer_id"], unique=True)
    op.create_index("ix_users_stripe_subscription_id", "users", ["stripe_subscription_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_stripe_subscription_id", table_name="users")
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "subscription_status")
    postgresql.ENUM(name="subscription_status").drop(op.get_bind(), checkfirst=True)
