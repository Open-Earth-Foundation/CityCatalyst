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
        user_id: str,
    ) -> Tuple[str, int]:
        """Refresh an expired token using CA service API key.
        
        Args:
            user_id: User ID for token scoping
        
        Returns:
            Tuple of (fresh_jwt_token, expires_in_seconds)
        
        Raises:
            TokenRefreshError: If token refresh fails
        """
        if not self.base_url:
            raise TokenRefreshError(
                "CC_BASE_URL not configured. Cannot refresh token."
            )
        
        settings = get_settings()
        if not settings.cc_api_key:
            raise TokenRefreshError(
                "CC_API_KEY not configured. Cannot authenticate with CityCatalyst."
            )
        
        url = f"{self.base_url}/api/v1/internal/ca/user-token"
        payload = {
            "user_id": user_id,
        }
        headers = {
            "X-CA-Service-Key": settings.cc_api_key,
            "Content-Type": "application/json"
        }
        
        try:
            client = await self._get_client()
            logger.debug(
                "Refreshing token for user=%s",
                user_id,
            )
            
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            fresh_token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)
            
            if not fresh_token:
                raise TokenRefreshError("No token in refresh response")
            
            logger.info("Token refreshed successfully for user=%s", user_id)
            return fresh_token, expires_in
            
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
                token, _ = await self.refresh_token(user_id)
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
                    token, _ = await self.refresh_token(user_id)
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
    
    # Convenience methods for common CC API operations
    
    async def get_inventory(
        self,
        inventory_id: str,
        token: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """Fetch inventory data from CityCatalyst.
        
        Args:
            inventory_id: Inventory UUID
            token: User access token
            user_id: User ID for token refresh context
            
        Returns:
            Inventory data dictionary
            
        Raises:
            CityCatalystClientError: If API call fails
        """
        if not self.base_url:
            raise CityCatalystClientError("CC_BASE_URL not configured")
        
        url = f"{self.base_url}/api/v1/inventory/{inventory_id}"
        response = await self.get_with_auto_refresh(
            url=url,
            token=token,
            user_id=user_id,
            thread_id="",  # Not used in new refresh method
        )
        
        if not response.is_success:
            error_text = response.text[:200] if response.text else "Unknown error"
            raise CityCatalystClientError(
                f"Failed to fetch inventory {inventory_id}: {response.status_code} - {error_text}"
            )
        
        try:
            return response.json()
        except Exception as e:
            raise CityCatalystClientError(f"Failed to parse inventory response: {e}") from e
    
    async def get_city(
        self,
        city_id: str,
        token: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """Fetch city data from CityCatalyst.
        
        Args:
            city_id: City UUID
            token: User access token
            user_id: User ID for token refresh context
            
        Returns:
            City data dictionary
            
        Raises:
            CityCatalystClientError: If API call fails
        """
        if not self.base_url:
            raise CityCatalystClientError("CC_BASE_URL not configured")
        
        url = f"{self.base_url}/api/v1/city/{city_id}"
        response = await self.get_with_auto_refresh(
            url=url,
            token=token,
            user_id=user_id,
            thread_id="",  # Not used in new refresh method
        )
        
        if not response.is_success:
            error_text = response.text[:200] if response.text else "Unknown error"
            raise CityCatalystClientError(
                f"Failed to fetch city {city_id}: {response.status_code} - {error_text}"
            )
        
        try:
            return response.json()
        except Exception as e:
            raise CityCatalystClientError(f"Failed to parse city response: {e}") from e
