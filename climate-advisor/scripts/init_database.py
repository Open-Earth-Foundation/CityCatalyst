#!/usr/bin/env python3
"""
Database initialization script for Climate Advisor.
This script sets up the database schema by running SQL commands directly.
"""

import os
import sys
from pathlib import Path

# Add the service directory to the path so we can import the settings
sys.path.insert(0, str(Path(__file__).parent.parent / "service"))

try:
    import psycopg2
    from app.config.settings import get_settings
except ImportError as e:
    print(f"Error importing required modules: {e}")
    print("Make sure you're running this from the climate-advisor directory")
    sys.exit(1)


def init_database():
    """Initialize the database with required tables."""
    try:
        # Get database settings
        settings = get_settings()

        if not settings.database_url:
            print("Error: CA_DATABASE_URL environment variable is not set")
            return False

        print(f"Connecting to database: {settings.database_url.replace(settings.database_url.split('@')[0].split('//')[1].split(':')[0] + ':***@', '***:***@')}")

        # Connect to the database using psycopg2 (convert asyncpg URL to standard postgresql URL)
        db_url = settings.database_url
        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

        conn = psycopg2.connect(db_url)
        conn.autocommit = True  # Enable autocommit for DDL statements

        # Read and execute the SQL setup script
        sql_file = Path(__file__).parent / "setup_database.sql"
        if not sql_file.exists():
            print(f"Error: SQL setup file not found: {sql_file}")
            conn.close()
            return False

        with open(sql_file, 'r') as f:
            sql_script = f.read()

        print("Executing database setup script...")
        with conn.cursor() as cursor:
            cursor.execute(sql_script)

        # Verify tables were created
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'threads'")
            threads_result = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'messages'")
            messages_result = cursor.fetchone()[0]

        print(f"Setup complete! Tables created: threads={threads_result > 0}, messages={messages_result > 0}")

        conn.close()
        return True

    except Exception as e:
        print(f"Error initializing database: {e}")
        return False


def main():
    """Main function to run database initialization."""
    print("🔄 Initializing Climate Advisor database...")

    # Check if we're in the right directory
    if not Path("service").exists():
        print("Error: Please run this script from the climate-advisor directory")
        sys.exit(1)

    # Run the initialization
    success = init_database()

    if success:
        print("✅ Database initialization completed successfully!")
        print("The Climate Advisor service should now be able to connect to the database.")
    else:
        print("❌ Database initialization failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
