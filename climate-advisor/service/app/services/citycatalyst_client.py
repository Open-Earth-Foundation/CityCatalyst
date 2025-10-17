"""
CityCatalyst HTTP Client for JWT Token Management and Inventory API Access

This module provides an HTTP client for secure communication with CityCatalyst:
- JWT token exchange and refresh
- Bearer token authentication for API calls
- Automatic token refresh on expiry
- Error handling and retry logic
- Secure token redaction in logs
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx

from ..config import get_settings
from ..utils.token_manager import (
    is_token_expired,
    redact_token,
    get_token_expiry,
    create_token_context,
)

logger = logging.getLogger(__name__)


class TokenRefreshError(Exception):
    """Raised when token refresh fails."""
    pass


class CityCatalystClientError(Exception):
    """Base exception for CityCatalyst client errors."""
    pass


class CityCatalystClient:
    """HTTP client for CityCatalyst integration.
    
    Handles JWT token lifecycle:
    - Validates token expiry before use
    - Automatically refreshes expired tokens
    - Makes authenticated requests to CC inventory APIs
    - Gracefully handles auth failures
    """
    
    def __init__(self, base_url: Optional[str] = None, timeout: int = 30):
        """Initialize CityCatalyst client.
        
        Args:
            base_url: CityCatalyst base URL (defaults to settings.cc_base_url)
            timeout: Request timeout in seconds
        """
        settings = get_settings()
        self.base_url = base_url or settings.cc_base_url
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        
        if not self.base_url:
            logger.warning(
                "CityCatalyst base URL not configured. "
                "Set CC_BASE_URL environment variable for token refresh and inventory access."
            )
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client
    
    async def close(self) -> None:
        """Close HTTP client connection."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    async def refresh_token(
        self,
        token: str,
        user_id: str,
        thread_id: str,
    ) -> str:
        """Refresh an expired token with CityCatalyst.
        
        Args:
            token: Current (possibly expired) JWT token
            user_id: User ID for context
            thread_id: Thread ID for context
        
        Returns:
            Fresh JWT token
        
        Raises:
            TokenRefreshError: If token refresh fails
        """
        if not self.base_url:
            raise TokenRefreshError(
                "CC_BASE_URL not configured. Cannot refresh token."
            )
        
        url = f"{self.base_url}/api/v0/assistants/token-refresh"
        payload = {
            "user_id": user_id,
            "thread_id": str(thread_id),
        }
        
        try:
            client = await self._get_client()
            logger.debug(
                "Refreshing token for user=%s, thread=%s",
                user_id,
                thread_id,
            )
            
            response = await client.post(url, json=payload)
            response.raise_for_status()
            
            data = response.json()
            fresh_token = data.get("access_token")
            
            if not fresh_token:
                raise TokenRefreshError("No token in refresh response")
            
            logger.info("Token refreshed successfully for user=%s", user_id)
            return fresh_token
            
        except httpx.HTTPStatusError as e:
            logger.error(
                "Token refresh failed with status %d: %s",
                e.response.status_code,
                e.response.text[:200],
            )
            raise TokenRefreshError(f"Token refresh failed: HTTP {e.response.status_code}") from e
        except Exception as e:
            logger.error("Token refresh error: %s", e)
            raise TokenRefreshError(f"Token refresh failed: {e}") from e
    
    async def get_with_auto_refresh(
        self,
        url: str,
        *,
        token: str,
        user_id: str,
        thread_id: str,
        auto_refresh: bool = True,
    ) -> httpx.Response:
        """Make GET request with automatic token refresh on 401.
        
        Args:
            url: Full URL to request
            token: Bearer token
            user_id: User ID (for token refresh context)
            thread_id: Thread ID (for token refresh context)
            auto_refresh: Automatically refresh token on 401
        
        Returns:
            Response object
        
        Raises:
            CityCatalystClientError: If request fails
        """
        # Check if token is expired and refresh preemptively
        if is_token_expired(token):
            logger.debug("Token expired, refreshing preemptively")
            try:
                token = await self.refresh_token(token, user_id, thread_id)
            except TokenRefreshError as e:
                logger.warning("Preemptive token refresh failed: %s", e)
                # Continue with expired token - let server reject it
        
        try:
            client = await self._get_client()
            headers = self._auth_headers(token)
            
            logger.debug("Making GET request to %s", url)
            response = await client.get(url, headers=headers)
            
            # Handle 401 Unauthorized - try to refresh
            if response.status_code == 401 and auto_refresh:
                logger.debug("Got 401, attempting token refresh")
                try:
                    token = await self.refresh_token(token, user_id, thread_id)
                    headers = self._auth_headers(token)
                    response = await client.get(url, headers=headers)
                except TokenRefreshError as e:
                    logger.error("Failed to refresh token: %s", e)
                    raise CityCatalystClientError(f"Authentication failed: {e}") from e
            
            return response
            
        except Exception as e:
            logger.error("Request failed: %s", e)
            raise CityCatalystClientError(f"Request failed: {e}") from e
    
    async def post_with_auto_refresh(
        self,
        url: str,
        *,
        token: str,
        user_id: str,
        thread_id: str,
        json_data: Optional[Dict[str, Any]] = None,
        auto_refresh: bool = True,
    ) -> httpx.Response:
        """Make POST request with automatic token refresh on 401.
        
        Args:
            url: Full URL to request
            token: Bearer token
            user_id: User ID (for token refresh context)
            thread_id: Thread ID (for token refresh context)
            json_data: JSON payload
            auto_refresh: Automatically refresh token on 401
        
        Returns:
            Response object
        
        Raises:
            CityCatalystClientError: If request fails
        """
        # Check if token is expired and refresh preemptively
        if is_token_expired(token):
            logger.debug("Token expired, refreshing preemptively")
            try:
                token = await self.refresh_token(token, user_id, thread_id)
            except TokenRefreshError as e:
                logger.warning("Preemptive token refresh failed: %s", e)
        
        try:
            client = await self._get_client()
            headers = self._auth_headers(token)
            
            logger.debug("Making POST request to %s", url)
            response = await client.post(url, headers=headers, json=json_data)
            
            # Handle 401 Unauthorized - try to refresh
            if response.status_code == 401 and auto_refresh:
                logger.debug("Got 401, attempting token refresh")
                try:
                    token = await self.refresh_token(token, user_id, thread_id)
                    headers = self._auth_headers(token)
                    response = await client.post(url, headers=headers, json=json_data)
                except TokenRefreshError as e:
                    logger.error("Failed to refresh token: %s", e)
                    raise CityCatalystClientError(f"Authentication failed: {e}") from e
            
            return response
            
        except Exception as e:
            logger.error("Request failed: %s", e)
            raise CityCatalystClientError(f"Request failed: {e}") from e
    
    def _auth_headers(self, token: str) -> Dict[str, str]:
        """Build authorization headers for requests.
        
        Args:
            token: Bearer token
        
        Returns:
            Headers dictionary
        """
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
