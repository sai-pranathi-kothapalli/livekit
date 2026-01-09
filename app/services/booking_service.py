"""
Booking Service

Handles interview booking operations with Supabase.
"""

import secrets
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from supabase import create_client, Client
from app.config import Config
from app.utils.logger import get_logger
from app.utils.exceptions import AgentError

logger = get_logger(__name__)


class BookingService:
    """Service for managing interview bookings"""
    
    def __init__(self, config: Config):
        self.config = config
        self.supabase: Client = create_client(
            config.supabase.url,
            config.supabase.service_role_key
        )
    
    def create_booking(
        self,
        name: str,
        email: str,
        phone: str,
        scheduled_at: datetime,
        resume_text: Optional[str] = None,
        resume_url: Optional[str] = None,
    ) -> str:
        """
        Create a new interview booking.
        
        Args:
            name: Applicant name
            email: Applicant email
            phone: Applicant phone
            scheduled_at: Scheduled interview datetime
            resume_text: Extracted resume text
            resume_url: URL to resume file in storage
            
        Returns:
            Booking token (32-char hex string)
            
        Raises:
            AgentError: If booking creation fails
        """
        # Generate unique token
        token = secrets.token_hex(16)  # 32 characters
        
        booking_data = {
            'token': token,
            'name': name,
            'email': email,
            'phone': phone,
            'scheduled_at': scheduled_at.astimezone(timezone.utc).isoformat() if scheduled_at.tzinfo else scheduled_at.isoformat(),
            'created_at': datetime.utcnow().isoformat(),
            'resume_text': resume_text,
            'resume_url': resume_url,
        }
        
        try:
            result = self.supabase.table('interview_bookings').insert(booking_data).execute()
            
            if result.data:
                logger.info(f"[BookingService] ✅ Created booking for {email} with token {token}")
                return token
            else:
                raise AgentError("Failed to create booking: No data returned", "booking")
                
        except Exception as e:
            error_msg = f"Failed to create booking: {str(e)}"
            logger.error(f"[BookingService] {error_msg}", exc_info=True)
            raise AgentError(error_msg, "booking")
    
    def get_booking(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Get booking by token.
        
        Args:
            token: Booking token
            
        Returns:
            Booking data dict or None if not found
        """
        try:
            result = self.supabase.table('interview_bookings')\
                .select('*')\
                .eq('token', token)\
                .maybe_single()\
                .execute()
            
            # maybe_single() returns None if no record found
            if result is None:
                logger.info(f"[BookingService] No booking found for token {token}")
                return None
            
            if result.data:
                logger.info(f"[BookingService] Found booking for token {token}")
                return result.data
            else:
                logger.info(f"[BookingService] No booking found for token {token}")
                return None
                
        except Exception as e:
            logger.error(f"[BookingService] Error fetching booking: {str(e)}", exc_info=True)
            return None
    
    def upload_resume_to_storage(self, file_content: bytes, filename: str) -> str:
        """
        Upload resume file to Supabase Storage.
        
        Args:
            file_content: File content as bytes
            filename: Original filename
            
        Returns:
            Public URL of uploaded file
            
        Raises:
            AgentError: If upload fails
        """
        # Generate unique filename
        from pathlib import Path
        import time
        import random
        import string
        
        file_ext = Path(filename).suffix
        unique_filename = f"{int(time.time())}_{''.join(random.choices(string.ascii_lowercase + string.digits, k=7))}{file_ext}"
        
        try:
            # Upload to Supabase Storage
            response = self.supabase.storage.from_('resumes').upload(
                unique_filename,
                file_content,
                file_options={'content-type': 'application/octet-stream'}
            )
            
            if response:
                # Get public URL - Supabase Python client returns URL directly
                public_url_response = self.supabase.storage.from_('resumes').get_public_url(unique_filename)
                # The response is a dictionary with the URL
                if isinstance(public_url_response, dict):
                    public_url = public_url_response.get('publicUrl') or public_url_response.get('public_url')
                else:
                    public_url = str(public_url_response)
                
                if not public_url:
                    # Fallback: construct URL manually
                    public_url = f"{self.config.supabase.url}/storage/v1/object/public/resumes/{unique_filename}"
                
                logger.info(f"[BookingService] ✅ Uploaded resume: {unique_filename}")
                return public_url
            else:
                raise AgentError("Failed to upload resume: No response", "storage")
                
        except Exception as e:
            error_msg = f"Failed to upload resume to storage: {str(e)}"
            logger.error(f"[BookingService] {error_msg}", exc_info=True)
            raise AgentError(error_msg, "storage")

