from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db.session import get_db_session
from app.models.user import SubscriptionStatus, User
from app.services.billing import BillingService

router = APIRouter()
_settings = get_settings()


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class SubscriptionStatusResponse(BaseModel):
    status: str
    has_access: bool


class PlanOption(BaseModel):
    amount_cents: int
    currency: str
    interval: str
    price_id: str


class PlansResponse(BaseModel):
    monthly: PlanOption
    annual: PlanOption | None


@router.get("/plans", response_model=PlansResponse)
async def get_plans() -> PlansResponse:
    """Return subscription price options (no auth required)."""
    monthly = PlanOption(
        amount_cents=_settings.stripe_price_amount,
        currency=_settings.stripe_price_currency,
        interval="month",
        price_id=_settings.stripe_price_id,
    )
    annual = None
    if _settings.stripe_annual_price_id:
        annual = PlanOption(
            amount_cents=_settings.stripe_annual_price_amount,
            currency=_settings.stripe_price_currency,
            interval="year",
            price_id=_settings.stripe_annual_price_id,
        )
    return PlansResponse(monthly=monthly, annual=annual)


@router.get("/status", response_model=SubscriptionStatusResponse)
async def subscription_status(current_user: User = Depends(get_current_user)) -> SubscriptionStatusResponse:
    return SubscriptionStatusResponse(
        status=current_user.subscription_status.value,
        has_access=current_user.has_access,
    )


class CheckoutRequest(BaseModel):
    interval: str = "month"  # "month" or "year"


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest = CheckoutRequest(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    if current_user.has_access and current_user.subscription_status in (
        SubscriptionStatus.active, SubscriptionStatus.trialing
    ):
        raise HTTPException(status_code=400, detail="You already have an active subscription.")
    # Pick price ID based on interval
    price_id = _settings.stripe_price_id
    if body.interval == "year" and _settings.stripe_annual_price_id:
        price_id = _settings.stripe_annual_price_id
    try:
        service = BillingService(session)
        url = await service.create_checkout_session(current_user, price_id=price_id)
        return CheckoutResponse(checkout_url=url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create checkout session.") from exc


@router.post("/portal", response_model=PortalResponse)
async def create_portal(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PortalResponse:
    try:
        service = BillingService(session)
        url = await service.create_portal_session(current_user)
        return PortalResponse(portal_url=url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create billing portal session.") from exc


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Stripe sends events here. Must NOT be behind auth middleware."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        service = BillingService(session)
        await service.handle_webhook(payload, sig_header)
        return {"received": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Webhook processing failed.") from exc
