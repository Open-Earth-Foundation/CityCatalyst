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
    parse_jwt_claims,
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
    
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None, timeout: int = 30):
        """Initialize CityCatalyst client.

        Args:
            base_url: CityCatalyst base URL (defaults to settings.cc_base_url)
            api_key: CityCatalyst API key (defaults to settings.cc_api_key)
            timeout: Request timeout in seconds
        """
        settings = get_settings()
        self.base_url = base_url or settings.cc_base_url
        self.api_key = api_key or settings.cc_api_key
        self.timeout = timeout
        # Datasource aggregation pulls several upstream feeds and often exceeds the default 30s.
        self.datasource_timeout = max(self.timeout, 90)
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

            # Allow redirects for compatibility
            response = await client.post(url, json=payload, headers=headers, follow_redirects=True)
            response.raise_for_status()
            
            data = response.json()
            fresh_token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)
            
            if not fresh_token:
                raise TokenRefreshError("No token in refresh response")

            try:
                claims = parse_jwt_claims(fresh_token)
            except Exception as claim_error:
                logger.warning("Unable to parse refreshed token claims: %s", claim_error)
                claims = {}

            server_claim = claims.get("server") if isinstance(claims, dict) else None
            issuer = claims.get("iss") if isinstance(claims, dict) else None
            audience = claims.get("aud") if isinstance(claims, dict) else None

            logger.info(
                "Token refreshed successfully for user=%s (server=%s, iss=%s, aud=%s)",
                user_id,
                server_claim or "unknown",
                issuer or "unknown",
                audience or "unknown",
            )
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
        request_timeout: Optional[float] = None,
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
            timeout_value = request_timeout or self.timeout
            
            logger.debug("Making GET request to %s (timeout=%s)", url, timeout_value)
            response = await client.get(
                url,
                headers=headers,
                follow_redirects=True,
                timeout=timeout_value,
            )
            
            # Handle 401 Unauthorized - try to refresh
            if response.status_code == 401 and auto_refresh:
                logger.debug("Got 401, attempting token refresh")
                try:
                    token, _ = await self.refresh_token(user_id)
                    headers = self._auth_headers(token)
                    response = await client.get(
                        url,
                        headers=headers,
                        follow_redirects=True,
                        timeout=timeout_value,
                    )
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
        request_timeout: Optional[float] = None,
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
                token, _ = await self.refresh_token(user_id)
            except TokenRefreshError as e:
                logger.warning("Preemptive token refresh failed: %s", e)
        
        try:
            client = await self._get_client()
            headers = self._auth_headers(token)
            timeout_value = request_timeout or self.timeout
            
            logger.debug("Making POST request to %s (timeout=%s)", url, timeout_value)
            response = await client.post(
                url,
                headers=headers,
                json=json_data,
                follow_redirects=True,
                timeout=timeout_value,
            )
            
            # Handle 401 Unauthorized - try to refresh
            if response.status_code == 401 and auto_refresh:
                logger.debug("Got 401, attempting token refresh")
                try:
                    token, _ = await self.refresh_token(user_id)
                    headers = self._auth_headers(token)
                    response = await client.post(
                        url,
                        headers=headers,
                        json=json_data,
                        follow_redirects=True,
                        timeout=timeout_value,
                    )
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
            Headers dictionary with service authentication
        """
        settings = get_settings()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Service-Name": "climate-advisor",
            "X-Service-Key": settings.cc_api_key or "",
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

    async def get_user_inventories(
        self,
        *,
        token: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """Fetch all inventories available to the authenticated user.

        Args:
            token: User access token
            user_id: User ID for token refresh context

        Returns:
            Dictionary payload containing the list of inventories

        Raises:
            CityCatalystClientError: If API call fails
        """
        if not self.base_url:
            raise CityCatalystClientError("CC_BASE_URL not configured")

        url = f"{self.base_url}/api/v1/user/inventories/"
        response = await self.get_with_auto_refresh(
            url=url,
            token=token,
            user_id=user_id,
            thread_id="",  # Not used in new refresh method
        )

        if not response.is_success:
            error_text = response.text[:500] if response.text else "Unknown error"
            logger.error(
                "User inventories request failed: status=%s location=%s body=%s",
                response.status_code,
                response.headers.get("Location"),
                error_text,
            )
            raise CityCatalystClientError(
                f"Failed to fetch user inventories: {response.status_code} - {error_text}"
            )

        try:
            return response.json()
        except Exception as e:
            raise CityCatalystClientError(
                f"Failed to parse user inventories response: {e}"
            ) from e
    
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

    async def get_inventory_datasources(
        self,
        inventory_id: str,
        token: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """Fetch available data sources for an inventory from CityCatalyst.

        Args:
            inventory_id: Inventory UUID
            token: User access token
            user_id: User ID for token refresh context

        Returns:
            Data sources data dictionary containing successful sources, removed sources, and failed sources

        Raises:
            CityCatalystClientError: If API call fails
        """
        if not self.base_url:
            raise CityCatalystClientError("CC_BASE_URL not configured")

        url = f"{self.base_url}/api/v1/datasource/{inventory_id}/"
        response = await self.get_with_auto_refresh(
            url=url,
            token=token,
            user_id=user_id,
            thread_id="",  # Not used in new refresh method
            request_timeout=self.datasource_timeout,
        )

        if not response.is_success:
            error_text = response.text[:200] if response.text else "Unknown error"
            raise CityCatalystClientError(
                f"Failed to fetch data sources for inventory {inventory_id}: {response.status_code} - {error_text}"
            )

        try:
            return response.json()
        except Exception as e:
            raise CityCatalystClientError(f"Failed to parse data sources response: {e}") from e
