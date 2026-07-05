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

from app.config import get_settings
from app.utils.token_manager import (
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

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
    ) -> None:
        """Initialize a client error with an optional upstream HTTP status."""
        super().__init__(message)
        self.status_code = status_code


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
        raw_base_url = base_url or settings.cc_base_url
        self.base_url = raw_base_url.rstrip("/") if raw_base_url else None
        self.api_key = api_key or settings.cc_api_key
        self.timeout = timeout
        # Datasource aggregation pulls several upstream feeds and often exceeds the default 30s.
        self.datasource_timeout = max(self.timeout, 90)
        self._client: Optional[httpx.AsyncClient] = None
        self.last_refreshed_token: Optional[str] = None
        
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
        
        if not self.api_key:
            raise TokenRefreshError(
                "CC_API_KEY not configured. Cannot authenticate with CityCatalyst."
            )
        
        url = f"{self.base_url}/api/v1/internal/ca/user-token"
        payload = {
            "user_id": user_id,
        }
        headers = {
            "X-CA-Service-Key": self.api_key,
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
            fresh_token, expires_in, claims = self._validate_refresh_response(
                data=data,
                user_id=user_id,
            )

            server_claim = claims.get("server")
            issuer = claims.get("iss")
            audience = claims.get("aud")

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
        except TokenRefreshError:
            raise
        except Exception as e:
            logger.error("Token refresh error: %s", e)
            raise TokenRefreshError(f"Token refresh failed: {e}") from e

    def _validate_refresh_response(
        self,
        *,
        data: Any,
        user_id: str,
    ) -> tuple[str, int, dict[str, Any]]:
        """Validate refresh fields and JWT claims when the token exposes them."""
        if not isinstance(data, dict):
            raise TokenRefreshError("Invalid token refresh response")

        fresh_token = data.get("access_token")
        token_type = data.get("token_type")
        expires_in = data.get("expires_in")
        if not isinstance(fresh_token, str) or not fresh_token.strip():
            raise TokenRefreshError("No token in refresh response")
        if token_type is not None and token_type != "Bearer":
            raise TokenRefreshError("Invalid token type in refresh response")
        if (
            isinstance(expires_in, bool)
            or not isinstance(expires_in, (int, float))
            or expires_in <= 0
        ):
            raise TokenRefreshError("Invalid token expiry in refresh response")

        claims = parse_jwt_claims(fresh_token)
        if isinstance(claims, dict):
            if claims.get("sub") != user_id:
                raise TokenRefreshError("Refreshed token subject does not match requested user")
            if claims.get("iss") != "climate-advisor-service":
                raise TokenRefreshError("Invalid token issuer in refresh response")
            if not self._audience_matches(claims.get("aud")):
                raise TokenRefreshError("Invalid token audience in refresh response")
        else:
            claims = {}

        return fresh_token, int(expires_in), claims

    def _audience_matches(self, audience: Any) -> bool:
        """Return whether a token audience matches this configured CC base URL."""
        if not self.base_url:
            return False
        expected = self.base_url.rstrip("/")
        if isinstance(audience, str):
            return audience.rstrip("/") == expected
        if isinstance(audience, list):
            return any(
                isinstance(value, str) and value.rstrip("/") == expected
                for value in audience
            )
        return False
    
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

    def _internal_headers(self, token: Optional[str] = None) -> Dict[str, str]:
        """Build internal service-to-service headers for CityCatalyst capability calls."""
        headers = {
            "Content-Type": "application/json",
            "X-Service-Name": "climate-advisor",
            "X-Service-Key": self.api_key or "",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def post_internal_capability(
        self,
        path: str,
        *,
        json_data: Dict[str, Any],
        token: Optional[str] = None,
        request_timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """POST to an internal CityCatalyst capability endpoint with auth refresh."""
        if not self.base_url:
            raise CityCatalystClientError("CC_BASE_URL not configured")

        url = f"{self.base_url.rstrip('/')}{path}"
        client = await self._get_client()
        request_token = token
        user_id = self._refresh_user_id(json_data)
        self.last_refreshed_token = None

        response = await client.post(
            url,
            headers=self._internal_headers(request_token),
            json=json_data,
            follow_redirects=True,
            timeout=request_timeout or self.datasource_timeout,
        )

        # Retry once on 401 with a fresh user token, matching the public POST path.
        if response.status_code == 401 and request_token and user_id:
            logger.debug("Internal capability got 401, attempting token refresh")
            try:
                request_token, _ = await self.refresh_token(user_id)
                self.last_refreshed_token = request_token
                response = await client.post(
                    url,
                    headers=self._internal_headers(request_token),
                    json=json_data,
                    follow_redirects=True,
                    timeout=request_timeout or self.datasource_timeout,
                )
            except TokenRefreshError as e:
                logger.error("Failed to refresh internal capability token: %s", e)
                raise CityCatalystClientError(
                    f"Authentication failed: {e}",
                    status_code=401,
                ) from e

        if not response.is_success:
            error_text = response.text[:500] if response.text else "Unknown error"
            raise CityCatalystClientError(
                f"CC capability request failed: {response.status_code} - {error_text}",
                status_code=response.status_code,
            )

        try:
            return response.json()
        except Exception as e:
            raise CityCatalystClientError(
                f"Failed to parse CC capability response: {e}"
            ) from e

    def _refresh_user_id(self, payload: Dict[str, Any]) -> Optional[str]:
        """Return the user id available for internal capability token refresh."""
        user_id = payload.get("user_id")
        if user_id is None:
            return None
        user_id_text = str(user_id).strip()
        return user_id_text or None

    async def get_stationary_energy_allowed_capabilities(
        self,
        *,
        user_id: str,
        city_id: str,
        inventory_id: str,
        workflow_step: str,
        token: Optional[str] = None,
    ) -> list[str]:
        """Return the allowed Stationary Energy internal capabilities for a workflow step."""
        payload = {
            "user_id": user_id,
            "city_id": city_id,
            "inventory_id": inventory_id,
            "sector_code": "stationary_energy",
            "workflow_step": workflow_step,
        }
        data = await self.post_internal_capability(
            "/api/v1/internal/ca/capabilities/allowed-capabilities",
            json_data=payload,
            token=token,
        )

        if isinstance(data, list):
            capabilities = data
        else:
            capabilities = data.get("capabilities") or data.get("allowed_capabilities") or data
        if isinstance(capabilities, dict):
            capabilities = capabilities.get("capabilities") or capabilities.get("ids") or []
        if not isinstance(capabilities, list):
            raise CityCatalystClientError("Invalid allowed capabilities response")

        return [str(capability) for capability in capabilities]

    async def load_stationary_energy_context(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Load the bounded Stationary Energy context through the CC internal capability route."""
        return await self.post_internal_capability(
            "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context",
            json_data=request_payload,
            token=token,
        )

    async def load_inventory_list_accessible(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List accessible inventories through the CC capability route."""
        return await self.post_internal_capability(
            "/api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible",
            json_data=request_payload,
            token=token,
        )

    async def load_inventory_status_overview(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Load compact whole-inventory status through the CC capability route."""
        return await self.post_internal_capability(
            "/api/v1/internal/ca/capabilities/ghgi/inventory/status-overview",
            json_data=request_payload,
            token=token,
        )

    async def load_inventory_emissions_context(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Load compact whole-inventory emissions context through the CC capability route."""
        return await self.post_internal_capability(
            "/api/v1/internal/ca/capabilities/ghgi/inventory/emissions-context",
            json_data=request_payload,
            token=token,
        )

    async def commit_stationary_energy_accepted(
        self,
        *,
        request_payload: Dict[str, Any],
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Commit accepted Stationary Energy review rows through the CC internal capability route."""
        return await self.post_internal_capability(
            "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted",
            json_data=request_payload,
            token=token,
        )
    
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
