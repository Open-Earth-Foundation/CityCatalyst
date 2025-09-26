#!/usr/bin/env python3
"""
Simple database setup script to run inside the Climate Advisor container.
This script connects to the database and creates the required tables directly.
"""

import asyncio
import asyncpg
import os
import sys
from pathlib import Path

# Add the service directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "service"))

try:
    from app.config.settings import get_settings
except ImportError as e:
    print(f"Error importing settings: {e}")
    sys.exit(1)


async def setup_database():
    """Set up the database tables directly."""
    try:
        # Get database settings
        settings = get_settings()

        if not settings.database_url:
            print("Error: CA_DATABASE_URL environment variable is not set")
            return False

        print(f"Connecting to database...")

        # Connect to the database (convert asyncpg URL if needed)
        db_url = settings.database_url
        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

        print(f"Database URL: {db_url.replace(db_url.split('@')[0].split('//')[1].split(':')[0] + ':***@', '***:***@')}")

        conn = await asyncpg.connect(db_url)
        print("✅ Connected to database successfully!")

        # Create enum type for message roles
        print("Creating message_role enum type...")
        await conn.execute("""
            DO $$ BEGIN
                CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
        print("✅ Created message_role enum type")

        # Create threads table
        print("Creating threads table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS threads (
                thread_id UUID PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                inventory_id VARCHAR(255),
                title VARCHAR(255),
                context JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            )
        """)
        print("✅ Created threads table")

        # Create index for threads table
        print("Creating index on threads.user_id...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_threads_user_id ON threads (user_id)
        """)
        print("✅ Created index on threads.user_id")

        # Create messages table
        print("Creating messages table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                message_id UUID PRIMARY KEY,
                thread_id UUID NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
                user_id VARCHAR(255) NOT NULL,
                text TEXT NOT NULL,
                tools_used JSONB,
                role message_role NOT NULL DEFAULT 'user',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            )
        """)
        print("✅ Created messages table")

        # Create index for messages table
        print("Creating index on messages.thread_id...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_messages_thread_id ON messages (thread_id)
        """)
        print("✅ Created index on messages.thread_id")

        # Verify tables were created
        threads_result = await conn.fetchval("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'threads'")
        messages_result = await conn.fetchval("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'messages'")

        print(f"✅ Setup complete! Tables verified: threads={threads_result > 0}, messages={messages_result > 0}")

        await conn.close()
        return True

    except Exception as e:
        print(f"❌ Error setting up database: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main function to run database setup."""
    print("🔄 Setting up Climate Advisor database...")
    print("This script should be run inside the Climate Advisor container")

    success = asyncio.run(setup_database())

    if success:
        print("✅ Database setup completed successfully!")
        print("The Climate Advisor service should now be able to connect to the database.")
    else:
        print("❌ Database setup failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
