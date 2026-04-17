"""Stripe billing service — checkout sessions, customer portal, webhook processing."""
import logging
import uuid

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import SubscriptionStatus, User

logger = logging.getLogger(__name__)
settings = get_settings()

# Configure Stripe at import time; safe to call with empty key (SDK won't raise until API call)
stripe.api_key = settings.stripe_secret_key


class BillingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_checkout_session(self, user: User, price_id: str | None = None) -> str:
        """Create a Stripe Checkout Session and return the URL."""
        effective_price_id = price_id or settings.stripe_price_id
        # Ensure the user has a Stripe customer record
        customer_id = user.stripe_customer_id
        if not customer_id:
            customer = stripe.Customer.create(
                email=user.email,
                metadata={"user_id": str(user.id)},
            )
            customer_id = customer.id
            user.stripe_customer_id = customer_id
            await self.session.commit()

        session = stripe.checkout.Session.create(
            customer=customer_id,
            client_reference_id=str(user.id),
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": effective_price_id, "quantity": 1}],
            success_url=f"{settings.app_base_url}?payment=success",
            cancel_url=f"{settings.app_base_url}?payment=cancelled",
            allow_promotion_codes=True,
        )
        return session.url  # type: ignore[return-value]

    async def create_portal_session(self, user: User) -> str:
        """Create a Stripe Customer Portal session and return the URL."""
        if not user.stripe_customer_id:
            raise ValueError("No billing account found for this user.")
        portal = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=settings.app_base_url,
        )
        return portal.url

    async def handle_webhook(self, payload: bytes, sig_header: str) -> None:
        """Verify and process an incoming Stripe webhook event."""
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except stripe.SignatureVerificationError:
            raise ValueError("Invalid webhook signature.")

        event_type: str = event["type"]
        data = event["data"]["object"]

        if event_type == "checkout.session.completed":
            await self._on_checkout_completed(data)
        elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
            await self._on_subscription_updated(data)
        elif event_type == "customer.subscription.deleted":
            await self._on_subscription_deleted(data)
        elif event_type == "invoice.payment_failed":
            await self._on_payment_failed(data)
        else:
            logger.debug("unhandled_stripe_event", extra={"type": event_type})

    # ── Private helpers ──────────────────────────────────────

    async def _on_checkout_completed(self, session: dict) -> None:
        user_id = session.get("client_reference_id")
        subscription_id = session.get("subscription")
        customer_id = session.get("customer")
        if not user_id:
            return
        user = await self._get_user_by_id(uuid.UUID(user_id))
        if user is None:
            return
        user.stripe_customer_id = customer_id or user.stripe_customer_id
        user.stripe_subscription_id = subscription_id
        user.subscription_status = SubscriptionStatus.active
        await self.session.commit()
        logger.info("subscription_activated", extra={"user_id": user_id})

    async def _on_subscription_updated(self, subscription: dict) -> None:
        status_map = {
            "active": SubscriptionStatus.active,
            "trialing": SubscriptionStatus.trialing,
            "past_due": SubscriptionStatus.past_due,
            "canceled": SubscriptionStatus.cancelled,
            "unpaid": SubscriptionStatus.past_due,
        }
        stripe_status = subscription.get("status", "")
        new_status = status_map.get(stripe_status)
        if new_status is None:
            return
        user = await self._get_user_by_stripe_subscription(subscription["id"])
        if user is None:
            # Fallback: look up by customer id
            user = await self._get_user_by_stripe_customer(subscription.get("customer", ""))
        if user is None:
            return
        user.subscription_status = new_status
        await self.session.commit()

    async def _on_subscription_deleted(self, subscription: dict) -> None:
        user = await self._get_user_by_stripe_subscription(subscription["id"])
        if user is None:
            user = await self._get_user_by_stripe_customer(subscription.get("customer", ""))
        if user is None:
            return
        user.subscription_status = SubscriptionStatus.cancelled
        user.stripe_subscription_id = None
        await self.session.commit()
        logger.info("subscription_cancelled", extra={"user_id": str(user.id)})

    async def _on_payment_failed(self, invoice: dict) -> None:
        user = await self._get_user_by_stripe_customer(invoice.get("customer", ""))
        if user is None:
            return
        user.subscription_status = SubscriptionStatus.past_due
        await self.session.commit()

    async def _get_user_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def _get_user_by_stripe_customer(self, customer_id: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        return result.scalar_one_or_none()

    async def _get_user_by_stripe_subscription(self, subscription_id: str) -> User | None:
        result = await self.session.execute(
            select(User).where(User.stripe_subscription_id == subscription_id)
        )
        return result.scalar_one_or_none()
