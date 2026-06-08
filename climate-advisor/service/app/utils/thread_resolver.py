"""Thread resolution and creation logic."""

from __future__ import annotations

import logging
from typing import Optional, Union
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.requests import MessageCreateRequest, ThreadCreateRequest
from app.services.thread_service import ThreadService

logger = logging.getLogger(__name__)


class ThreadResolver:
    """Handles thread resolution and creation for message endpoints."""

    @staticmethod
    async def resolve_thread(
        thread_id: Optional[Union[str, UUID]],
        payload: MessageCreateRequest,
        user_id: str,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
    ) -> Union[str, UUID]:
        """Resolve or create a thread ID for the request.

        Args:
            thread_id: Optional thread ID from path parameter
            payload: Message creation request
            user_id: User ID from authentication
            session_factory: Database session factory (optional)

        Returns:
            Resolved thread ID (existing or newly created)

        Raises:
            HTTPException: If thread creation fails, the thread does not exist,
                the thread belongs to another user, or thread_id format is invalid
        """
        # If thread_id is provided in path, validate format and require it to exist.
        if thread_id is not None:
            ThreadResolver._validate_uuid_format(thread_id)
            return await ThreadResolver._validate_existing_thread(
                thread_id, user_id, session_factory
            )

        # If thread_id is in payload, validate format and require it to exist.
        if payload.thread_id is not None:
            ThreadResolver._validate_uuid_format(payload.thread_id)
            return await ThreadResolver._validate_existing_thread(
                payload.thread_id, user_id, session_factory
            )

        # Otherwise, create a new thread
        return await ThreadResolver._create_new_thread(user_id, payload, session_factory)

    @staticmethod
    def _validate_uuid_format(thread_id: Union[str, UUID]) -> None:
        """Validate that thread_id is a valid UUID format.

        Raises:
            HTTPException 400: If UUID format is invalid
        """
        if isinstance(thread_id, UUID):
            return  # Already a UUID object, valid

        if isinstance(thread_id, str):
            try:
                UUID(thread_id)
                return  # Valid UUID string
            except ValueError as e:
                logger.error(
                    "Invalid thread_id format: %s (error: %s)",
                    thread_id,
                    str(e)
                )
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": "Invalid thread ID format",
                        "error": f"invalid input syntax for type uuid: \"{thread_id}\"",
                        "hint": "thread_id must be a valid UUID format (e.g., '550e8400-e29b-41d4-a716-446655440000')"
                    }
                ) from e

        # If not string or UUID, try to convert to string and validate
        try:
            UUID(str(thread_id))
        except ValueError as e:
            logger.error(
                "Invalid thread_id format: %s (error: %s)",
                thread_id,
                str(e)
            )
            raise HTTPException(
                status_code=400,
                detail={"message": "Invalid thread ID format"}
            ) from e

    @staticmethod
    async def _validate_existing_thread(
        thread_id: Union[str, UUID],
        user_id: str,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
    ) -> Union[str, UUID]:
        """Validate that a provided thread exists and belongs to the user.

        Returns the existing ``thread_id`` when validation succeeds.

        Raises:
            HTTPException 404: If the thread does not exist.
            HTTPException 403: If the thread belongs to a different user.
        """
        # If no database access, assume thread is valid
        if session_factory is None:
            logger.info(
                "No database session available; assuming thread_id=%s is valid.",
                thread_id
            )
            return thread_id
        
        # Load thread from database
        try:
            async with session_factory() as session:
                thread_service = ThreadService(session)
                await thread_service.get_thread_for_user(thread_id, user_id)
        except HTTPException:
            raise
        except Exception as e:
            # For other exceptions, just return the thread_id and let streaming continue
            # This provides graceful degradation when database is temporarily unavailable
            logger.warning(
                "Failed to validate thread (database may be unavailable): %s. "
                "Continuing with provided thread_id=%s",
                e,
                thread_id
            )
            return thread_id

        logger.info("Using existing thread_id=%s", thread_id)
        return thread_id

    @staticmethod
    async def _create_new_thread(
        user_id: str,
        payload: MessageCreateRequest,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
    ) -> Union[str, UUID]:
        """Create a new thread for the conversation.

        This method attempts to persist the thread to the database, but falls back
        to an ephemeral thread ID if database is unavailable, allowing graceful degradation.
        """
        new_thread_id = uuid4()

        # If no database access, return generated ID without persisting
        if session_factory is None:
            logger.info(
                "No database session available; creating ephemeral thread_id=%s",
                new_thread_id
            )
            return new_thread_id

        # Persist thread to database
        try:
            async with session_factory() as session:
                thread_service = ThreadService(session)

                # Build thread creation request
                thread_payload = ThreadCreateRequest(
                    user_id=user_id,
                    inventory_id=payload.inventory_id,
                    context=payload.context,
                )

                created_thread = await thread_service.create_thread(
                    thread_payload,
                    thread_id=new_thread_id
                )
                await session.commit()
                logger.info("Created new thread_id=%s for user_id=%s", created_thread.thread_id, user_id)
                return created_thread.thread_id
        
        except HTTPException:
            raise
        except Exception as e:
            # If thread creation fails, log warning but return ephemeral thread ID
            # This allows conversation to continue even if database is temporarily down
            logger.warning(
                "Failed to persist thread (database may be unavailable): %s. "
                "Using ephemeral thread_id=%s",
                e,
                new_thread_id
            )
            return new_thread_id

