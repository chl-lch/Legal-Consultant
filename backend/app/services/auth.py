import secrets
import uuid
from datetime import datetime, timedelta, timezone

TRIAL_DAYS = 7

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import User
from app.services.email import send_password_reset_email

settings = get_settings()
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> uuid.UUID:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise ValueError("Missing subject in token")
        return uuid.UUID(user_id)
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def register(self, email: str, password: str) -> User:
        existing = await self._get_by_email(email)
        if existing is not None:
            raise ValueError("Email already registered.")
        user = User(
            email=email.lower(),
            hashed_password=hash_password(password),
            trial_ends_at=datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS),
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def login(self, email: str, password: str) -> User:
        user = await self._get_by_email(email)
        if user is None or not verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password.")
        if not user.is_active:
            raise ValueError("Account is disabled.")
        return user

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def forgot_password(self, email: str, app_base_url: str) -> None:
        user = await self._get_by_email(email)
        if user is None:
            return
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await self.session.commit()
        reset_url = f"{app_base_url}?reset_token={token}"
        await send_password_reset_email(user.email, reset_url)

    async def reset_password(self, token: str, new_password: str) -> None:
        result = await self.session.execute(select(User).where(User.reset_token == token))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("Invalid or expired reset link.")
        if user.reset_token_expires is None or user.reset_token_expires < datetime.now(timezone.utc):
            raise ValueError("Reset link has expired.")
        user.hashed_password = hash_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        await self.session.commit()

    async def _get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()
