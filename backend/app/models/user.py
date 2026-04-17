import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SubscriptionStatus(str, enum.Enum):
    none = "none"          # never subscribed
    trialing = "trialing"  # on trial (Stripe-managed)
    active = "active"      # paid and current
    past_due = "past_due"  # payment failed, grace period
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        default=SubscriptionStatus.none,
        nullable=False,
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    reset_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["Document"]] = relationship(back_populates="owner", cascade="all, delete-orphan")  # noqa: F821

    @property
    def has_access(self) -> bool:
        if self.is_admin:
            return True
        if self.subscription_status in (SubscriptionStatus.active, SubscriptionStatus.trialing):
            return True
        # Free 7-day trial
        if self.trial_ends_at is not None:
            return datetime.now(timezone.utc) < self.trial_ends_at
        return False

    @property
    def is_on_trial(self) -> bool:
        """True when the user is accessing via the free trial (not a paid subscription)."""
        if self.is_admin:
            return False
        if self.subscription_status in (SubscriptionStatus.active, SubscriptionStatus.trialing):
            return False
        if self.trial_ends_at is None:
            return False
        return datetime.now(timezone.utc) < self.trial_ends_at

    @property
    def trial_days_remaining(self) -> int | None:
        if not self.is_on_trial or self.trial_ends_at is None:
            return None
        delta = self.trial_ends_at - datetime.now(timezone.utc)
        return max(0, delta.days)
