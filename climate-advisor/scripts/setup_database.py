
#!/usr/bin/env python3
"""
Climate Advisor Database Setup Utility

Unified script for setting up the Climate Advisor database using Alembic migrations.
Works in both local development and containerized environments.

Inputs:
    --drop: Optional flag to drop all tables before running migrations (destructive)
    --check: Optional flag to only check database connectivity without making changes

Outputs:
    Sets up database schema using Alembic migrations
    Prints success message or error details to stdout/stderr

Usage:
    # Run migrations (recommended)
    python scripts/setup_database.py

    # Reset database completely (drops all tables, then runs migrations)
    python scripts/setup_database.py --drop

    # Check database connectivity only
    python scripts/setup_database.py --check

Prerequisites:
    - PostgreSQL database must be running and accessible
    - CA_DATABASE_URL environment variable must be set
    - .env file should be present (for local development)

Note:
    This script uses Alembic migrations - the proper way to manage schema changes.
    All schema changes should be tracked via migration files in service/migrations/versions/
"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv

# Add service directory to path so we can import from app
_service_path = Path(__file__).resolve().parent.parent / "service"
if str(_service_path) not in sys.path:
    sys.path.insert(0, str(_service_path))


def _load_env() -> None:
    """Load environment variables from .env file."""
    env_path = find_dotenv(usecwd=True)
    if env_path:
        print(f"[+] Loading environment from: {env_path}")
        load_dotenv(env_path)
    else:
        # Try climate-advisor root .env
        ca_root = Path(__file__).resolve().parent.parent
        repo_env = ca_root / ".env"
        if repo_env.exists():
            print(f"[+] Loading environment from: {repo_env}")
            load_dotenv(repo_env)
        else:
            print("[!] No .env file found, using environment variables")


async def _check_database_connection() -> bool:
    """Check if we can connect to the database."""
    try:
        import asyncpg
        from app.config.settings import get_settings
        
        settings = get_settings()
        
        if not settings.database_url:
            print("[!] Error: CA_DATABASE_URL environment variable is not set")
            return False
        
        # Convert URL for asyncpg if needed
        db_url = settings.database_url
        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        
        # Mask password in output
        safe_url = db_url
        if '@' in db_url:
            parts = db_url.split('@')
            if '//' in parts[0]:
                user_pass = parts[0].split('//')[1]
                if ':' in user_pass:
                    safe_url = db_url.replace(user_pass.split(':')[1], '***')
        
        print(f"[*] Connecting to database: {safe_url}")
        
        conn = await asyncpg.connect(db_url, timeout=10)
        
        # Test query
        version = await conn.fetchval("SELECT version()")
        print(f"[+] Database connection successful!")
        print(f"    PostgreSQL version: {version.split(',')[0]}")
        
        await conn.close()
        return True
        
    except ImportError as e:
        print(f"[!] Error: Missing dependency: {e}")
        print("    Install with: pip install asyncpg")
        return False
    except Exception as e:
        print(f"[!] Database connection failed: {e}")
        return False


async def _drop_all_tables() -> bool:
    """Drop all tables in the database (destructive operation)."""
    try:
        import asyncpg
        from app.config.settings import get_settings
        
        settings = get_settings()
        db_url = settings.database_url
        
        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        
        print("[-] Dropping all tables and extensions...")
        
        conn = await asyncpg.connect(db_url)
        
        # Drop tables with CASCADE
        await conn.execute("""
            DROP TABLE IF EXISTS messages CASCADE;
            DROP TABLE IF EXISTS threads CASCADE;
            DROP TABLE IF EXISTS document_embeddings CASCADE;
            DROP TABLE IF EXISTS alembic_version CASCADE;
        """)
        
        # Drop types
        await conn.execute("DROP TYPE IF EXISTS message_role CASCADE;")
        
        # Note: Not dropping vector extension as it might be used by other databases
        print("[+] All tables dropped successfully")
        
        await conn.close()
        return True
        
    except Exception as e:
        print(f"[!] Error dropping tables: {e}")
        return False


def _run_alembic_migrations() -> bool:
    """Run Alembic migrations to set up/update the database schema."""
    try:
        # Change to service directory where alembic.ini is located
        service_root = Path(__file__).resolve().parent.parent / "service"
        original_dir = os.getcwd()
        os.chdir(service_root)
        
        print("[*] Running Alembic migrations...")
        print(f"    Working directory: {service_root}")
        
        # Run alembic upgrade head
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=False
        )
        
        # Print output
        if result.stdout:
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    print(f"    {line}")
        
        if result.returncode != 0:
            print(f"[!] Migration failed!")
            if result.stderr:
                print("Error output:")
                for line in result.stderr.strip().split('\n'):
                    if line.strip():
                        print(f"    {line}")
            return False
        
        print("[+] Migrations completed successfully!")
        
        # Change back to original directory
        os.chdir(original_dir)
        return True
        
    except FileNotFoundError:
        print("[!] Error: Alembic not found. Install with: pip install alembic")
        return False
    except Exception as e:
        print(f"[!] Error running migrations: {e}")
        return False


def _show_migration_status() -> None:
    """Show current migration status."""
    try:
        service_root = Path(__file__).resolve().parent.parent / "service"
        original_dir = os.getcwd()
        os.chdir(service_root)
        
        print("\n[i] Current migration status:")
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "current"],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.stdout:
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    print(f"    {line}")
        
        os.chdir(original_dir)
        
    except Exception as e:
        print(f"[!] Could not get migration status: {e}")


async def setup_database(drop_existing: bool = False, check_only: bool = False) -> bool:
    """
    Set up the Climate Advisor database.
    
    Args:
        drop_existing: If True, drop all tables before running migrations
        check_only: If True, only check connectivity without making changes
    
    Returns:
        True if successful, False otherwise
    """
    print("Climate Advisor Database Setup")
    print("=" * 50)
    
    # Check database connection
    if not await _check_database_connection():
        return False
    
    if check_only:
        print("\n[+] Database connectivity check passed!")
        return True
    
    # Drop tables if requested
    if drop_existing:
        print("\n[!] WARNING: This will delete all existing data!")
        if not await _drop_all_tables():
            return False
    
    # Run migrations
    print()
    if not _run_alembic_migrations():
        return False
    
    # Show final status
    _show_migration_status()
    
    return True


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Set up Climate Advisor database using Alembic migrations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                    # Run migrations (safe, idempotent)
  %(prog)s --drop             # Reset database (destructive!)
  %(prog)s --check            # Check database connectivity only

For more information, see: climate-advisor/README.md
        """
    )
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop all existing tables before running migrations (DESTRUCTIVE!)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check database connectivity without making changes",
    )
    args = parser.parse_args()
    
    # Load environment
    _load_env()
    
    # Run setup
    try:
        success = asyncio.run(setup_database(
            drop_existing=args.drop,
            check_only=args.check
        ))
        
        if success:
            print("\n" + "=" * 50)
            print("[+] Database setup completed successfully!")
            if not args.check:
                print("\nNext steps:")
                print("   1. Start the service: cd service && uvicorn app.main:app --reload")
                print("   2. Visit: http://localhost:8080/docs")
        else:
            print("\n" + "=" * 50)
            print("[!] Database setup failed!")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n[!] Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[!] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
