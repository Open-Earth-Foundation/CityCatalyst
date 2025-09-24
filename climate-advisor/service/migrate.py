#!/usr/bin/env python3
"""
Climate Advisor Database Migration Helper

This script provides easy commands for managing database migrations,
similar to the npm scripts used in the main CityCatalyst application.

Usage:
    python migrate.py upgrade    # Apply all pending migrations
    python migrate.py downgrade  # Downgrade one migration
    python migrate.py current    # Show current migration revision
    python migrate.py history    # Show migration history
    python migrate.py create "description"  # Create new migration
    python migrate.py auto "description"    # Auto-generate migration from model changes
"""

import sys
import subprocess
import os
from pathlib import Path


def run_alembic(cmd_args: list[str]) -> int:
    """Run alembic command with proper configuration."""
    # Ensure we're in the service directory
    service_dir = Path(__file__).parent
    os.chdir(service_dir)
    
    # Build the alembic command
    alembic_cmd = ["python", "-m", "alembic"] + cmd_args
    
    print(f"Running: {' '.join(alembic_cmd)}")
    
    try:
        result = subprocess.run(alembic_cmd, check=True)
        return result.returncode
    except subprocess.CalledProcessError as e:
        print(f"Migration command failed with exit code {e.returncode}")
        return e.returncode
    except Exception as e:
        print(f"Error running migration: {e}")
        return 1


def upgrade():
    """Apply all pending migrations."""
    print("🔄 Applying database migrations...")
    return run_alembic(["upgrade", "head"])


def downgrade():
    """Downgrade one migration."""
    print("⬇️ Downgrading one migration...")
    return run_alembic(["downgrade", "-1"])


def current():
    """Show current migration revision."""
    print("📍 Current migration revision:")
    return run_alembic(["current"])


def history():
    """Show migration history."""
    print("📜 Migration history:")
    return run_alembic(["history"])


def create_migration(description: str):
    """Create a new empty migration."""
    if not description:
        print("❌ Error: Migration description is required")
        print("Usage: python migrate.py create 'description of changes'")
        return 1
    
    print(f"📝 Creating new migration: {description}")
    return run_alembic(["revision", "-m", description])


def auto_migration(description: str):
    """Auto-generate migration from model changes."""
    if not description:
        print("❌ Error: Migration description is required")
        print("Usage: python migrate.py auto 'description of changes'")
        return 1
    
    print(f"🤖 Auto-generating migration: {description}")
    return run_alembic(["revision", "--autogenerate", "-m", description])


def show_help():
    """Show usage help."""
    print(__doc__)


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        show_help()
        return 1
    
    command = sys.argv[1].lower()
    
    if command == "upgrade":
        return upgrade()
    elif command == "downgrade":
        return downgrade()
    elif command == "current":
        return current()
    elif command == "history":
        return history()
    elif command == "create":
        description = sys.argv[2] if len(sys.argv) > 2 else ""
        return create_migration(description)
    elif command == "auto":
        description = sys.argv[2] if len(sys.argv) > 2 else ""
        return auto_migration(description)
    elif command in ["help", "-h", "--help"]:
        show_help()
        return 0
    else:
        print(f"❌ Unknown command: {command}")
        show_help()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
