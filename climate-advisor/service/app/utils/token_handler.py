"""CityCatalyst token management."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional, Union
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..services.thread_service import ThreadService

if TYPE_CHECKING:
    from ..services.agent_service import AgentService

logger = logging.getLogger(__name__)


class TokenHandler:
    """Manages CityCatalyst token refresh and persistence."""

    def __init__(
        self,
        thread_id: Union[str, UUID],
        user_id: str,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
    ):
        self.thread_id = thread_id
        self.user_id = user_id
        self.session_factory = session_factory

    async def handle_refreshed_token(
        self,
        refreshed_token: str,
        agent_service: Optional[AgentService] = None,
    ) -> bool:
        """Handle a refreshed CC token from tool execution.
        
        Args:
            refreshed_token: The new token value
            agent_service: Agent service to update with new token
            
        Returns:
            True if token was persisted successfully, False otherwise
        """
        logger.info(
            "Detected refreshed CityCatalyst token for thread_id=%s, attempting to persist.",
            self.thread_id
        )
        
        # Update agent service if provided
        if agent_service:
            agent_service.cc_access_token = refreshed_token
            logger.info("Updated AgentService with refreshed token")
        
        # Persist to database if available
        if self.session_factory:
            try:
                async with self.session_factory() as token_session:
                    thread_service = ThreadService(token_session)
                    thread = await thread_service.get_thread(self.thread_id)
                    if thread:
                        await thread_service.update_context(
                            thread=thread,
                            context_update={"access_token": refreshed_token},
                        )
                        await token_session.commit()
                        logger.info("Persisted refreshed token to thread context")
                        return True
            except Exception as token_exc:
                logger.warning(
                    "Failed to persist refreshed token to thread context: %s", token_exc
                )
                return False
        
        return False

    async def load_token_from_thread(self) -> Optional[str]:
        """Load CC token from thread context if available."""
        if not self.session_factory:
            logger.debug("No session factory available for token loading")
            return None
        
        try:
            async with self.session_factory() as session:
                thread_service = ThreadService(session)
                thread = await thread_service.get_thread(self.thread_id)
                
                if not thread:
                    logger.debug("Thread not found: thread_id=%s", self.thread_id)
                    return None
                
                if not thread.context:
                    logger.debug("Thread has no context: thread_id=%s", self.thread_id)
                    return None
                
                logger.debug(
                    "Thread context keys: %s",
                    list(thread.context.keys()) if thread.context else []
                )
                
                # Use the Thread model's get_access_token() method which looks for "access_token" key
                token = thread.get_access_token()
                if token:
                    logger.info("Loaded CC token from thread context for thread_id=%s", self.thread_id)
                    return token
                else:
                    logger.debug("No access_token in thread context for thread_id=%s", self.thread_id)
                    
        except Exception as e:
            logger.warning("Failed to load token from thread context: %s", e)
        
        return None

