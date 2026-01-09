"""
Email Service

Handles sending interview confirmation emails via SMTP.
"""

from datetime import datetime
from typing import Optional, Tuple
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import Config
from app.utils.logger import get_logger

logger = get_logger(__name__)


class EmailService:
    """Service for sending emails"""
    
    def __init__(self, config: Config):
        self.config = config
        self.enabled = bool(
            config.smtp.host and
            config.smtp.user and
            config.smtp.password
        )
    
    async def send_interview_email(
        self,
        to_email: str,
        name: str,
        interview_url: str,
        scheduled_at: datetime,
    ) -> Tuple[bool, Optional[str]]:
        """
        Send interview confirmation email.
        
        Args:
            to_email: Recipient email address
            name: Recipient name
            interview_url: Interview join URL
            scheduled_at: Scheduled interview datetime
            
        Returns:
            Tuple of (success, error_message)
        """
        if not self.enabled:
            logger.warning("[EmailService] SMTP not configured - skipping email send")
            return False, "Email service not configured"
        
        try:
            # Format date/time
            formatted_date = scheduled_at.strftime("%A, %B %d, %Y")
            formatted_time = scheduled_at.strftime("%I:%M %p")
            
            # Create email message
            message = MIMEMultipart("alternative")
            message["Subject"] = "Your Regional Rural Bank PO Interview - Join Link"
            message["From"] = f'"{self.config.smtp.from_name}" <{self.config.smtp.from_email}>'
            message["To"] = to_email
            
            # Create HTML email
            html_content = self._create_email_html(
                name, interview_url, formatted_date, formatted_time
            )
            
            html_part = MIMEText(html_content, "html")
            message.attach(html_part)
            
            # Send email
            # For port 587: use STARTTLS (connect plain, then upgrade to TLS)
            # For port 465: use direct TLS/SSL connection
            # SMTP_SECURE=true means use direct TLS (port 465), false means use STARTTLS (port 587)
            use_tls = self.config.smtp.secure  # Direct TLS for port 465
            start_tls = not self.config.smtp.secure  # STARTTLS for port 587
            
            await aiosmtplib.send(
                message,
                hostname=self.config.smtp.host,
                port=self.config.smtp.port,
                use_tls=use_tls,
                start_tls=start_tls,
                username=self.config.smtp.user,
                password=self.config.smtp.password,
            )
            
            logger.info(f"[EmailService] ✅ Email sent successfully to {to_email}")
            return True, None
            
        except Exception as e:
            error_msg = f"Failed to send email: {str(e)}"
            logger.error(f"[EmailService] {error_msg}", exc_info=True)
            return False, error_msg
    
    def _create_email_html(self, name: str, interview_url: str, formatted_date: str, formatted_time: str) -> str:
        """Create HTML email content"""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #002cf2 0%, #1fd5f9 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
        .details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        .button {{ display: inline-block; background: #002cf2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }}
        .button:hover {{ background: #001bb8; }}
        .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 30px; }}
        .detail-row {{ margin: 10px 0; }}
        .detail-label {{ font-weight: bold; color: #555; }}
        .logo-text {{ font-size: 16px; font-weight: bold; margin-top: 10px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Your Interview is Scheduled!</h1>
            <p style="margin: 0; font-size: 18px;">Regional Rural Bank Probationary Officer (PO)</p>
            <div class="logo-text">Sreedhar's CCE - RESULTS SUPER STAR</div>
        </div>
        <div class="content">
            <p>Hi <strong>{name}</strong>,</p>
            
            <p>Thank you for applying for the <strong>Regional Rural Bank Probationary Officer (PO)</strong> position!</p>
            
            <div class="details">
                <h2 style="margin-top: 0; color: #002cf2;">📅 Interview Details</h2>
                <div class="detail-row">
                    <span class="detail-label">Date:</span> {formatted_date}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time:</span> {formatted_time} (IST)
                </div>
                <div class="detail-row">
                    <span class="detail-label">Position:</span> Regional Rural Bank Probationary Officer (PO)
                </div>
            </div>

            <p><strong>Your unique interview link is ready!</strong> Click the button below to join your interview at the scheduled time:</p>
            
            <div style="text-align: center;">
                <a href="{interview_url}" class="button">Join Interview</a>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
                <strong>Important Notes:</strong>
            </p>
            <ul style="font-size: 14px; color: #666;">
                <li>This link will be active <strong>5 minutes before</strong> your scheduled time</li>
                <li>The interview window is open for <strong>60 minutes</strong> after the scheduled time</li>
                <li>Please ensure you have a stable internet connection and a quiet environment</li>
                <li>You can test your microphone and camera before joining</li>
                <li>The interview will cover: Personal Introduction, RRB Background, Current Affairs for Banking, and Domain Knowledge</li>
            </ul>
            
            <p style="font-size: 12px; color: #999; margin-top: 20px;">
                If you have any questions or need to reschedule, please contact us at your earliest convenience.
            </p>
            
            <div class="footer">
                <p>Best regards,<br><strong>Sreedhar's CCE Team</strong><br>RESULTS SUPER STAR</p>
                <p style="margin-top: 20px;">
                    <a href="{interview_url}" style="color: #002cf2; word-break: break-all;">{interview_url}</a>
                </p>
            </div>
        </div>
    </div>
</body>
</html>
"""

