import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def send_password_reset_email(to_email: str, reset_url: str) -> None:
    settings = get_settings()

    if not settings.smtp_host:
        logger.info(f"[DEV] Password reset for {to_email}: {reset_url}")
        return

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset your LexiCounsel password"
        msg["From"] = settings.smtp_from
        msg["To"] = to_email

        plain_text = f"Click the link below to reset your password:\n\n{reset_url}\n\nIf you did not request a password reset, you can ignore this email."
        html_text = f"""\
<html>
  <body>
    <p>Click the link below to reset your LexiCounsel password:</p>
    <p><a href="{reset_url}">Reset your password</a></p>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
  </body>
</html>"""

        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(html_text, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, to_email, msg.as_string())

    await asyncio.to_thread(_send)
