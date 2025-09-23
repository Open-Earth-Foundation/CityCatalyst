# Climate Advisor Database Migrations

This directory contains database migrations for the Climate Advisor service using Alembic.

## Overview

The Climate Advisor service uses:
- **SQLAlchemy** for ORM and database models
- **Alembic** for database migration management
- **PostgreSQL** as the primary database (with SQLite support for testing)

## Migration Files Structure

```
migrations/
├── env.py                 # Alembic environment configuration
├── script.py.mako        # Template for new migration files
├── versions/             # Individual migration files
│   └── 20250118_120000_initial_schema.py
└── README.md            # This file
```

## Quick Start

### Prerequisites

1. Ensure your database URL is configured in environment variables:
   ```bash
   export CA_DATABASE_URL="postgresql://user:password@localhost:5432/climate_advisor"
   ```

2. Make sure the database exists and is accessible.

### Running Migrations

Use the helper script from the service directory:

```bash
# Apply all pending migrations
python migrate.py upgrade

# Check current migration status
python migrate.py current

# View migration history
python migrate.py history
```

### Creating New Migrations

#### Auto-generate from model changes (recommended):
```bash
python migrate.py auto "add new column to users table"
```

#### Create empty migration for custom changes:
```bash
python migrate.py create "add custom index"
```

### Rolling Back Migrations

```bash
# Downgrade one migration
python migrate.py downgrade

# Downgrade to specific revision
python -m alembic downgrade <revision_id>
```

## Migration Best Practices

### 1. **Always Review Auto-Generated Migrations**
Auto-generated migrations might not capture all changes correctly. Always review and test them.

### 2. **Use Descriptive Names**
```bash
# Good
python migrate.py auto "add user preferences table"

# Bad  
python migrate.py auto "changes"
```

### 3. **Test Migrations Both Ways**
- Test upgrade: `python migrate.py upgrade`
- Test downgrade: `python migrate.py downgrade`

### 4. **Handle Data Migrations Carefully**
For complex data transformations, create custom migrations:

```python
def upgrade() -> None:
    # Schema changes first
    op.add_column('threads', sa.Column('new_field', sa.String(50)))
    
    # Data migration
    connection = op.get_bind()
    connection.execute(
        text("UPDATE threads SET new_field = 'default_value' WHERE new_field IS NULL")
    )
```

### 5. **Index Management**
Always create indexes for foreign keys and frequently queried columns:

```python
def upgrade() -> None:
    op.create_table('messages', ...)
    op.create_index('ix_messages_thread_id', 'messages', ['thread_id'])
    op.create_index('ix_messages_user_id', 'messages', ['user_id'])
```

## Development Workflow

### Adding New Models

1. Create/modify your SQLAlchemy models in `app/models/db/`
2. Import the model in `migrations/env.py` (if not already imported)
3. Generate migration: `python migrate.py auto "add new model"`
4. Review the generated migration file
5. Test the migration: `python migrate.py upgrade`
6. Test rollback: `python migrate.py downgrade`

### Modifying Existing Models

1. Update your SQLAlchemy model
2. Generate migration: `python migrate.py auto "modify model description"`
3. Review and test as above

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CA_DATABASE_URL` | Database connection URL | `postgresql://user:pass@localhost:5432/climate_advisor` |
| `CA_DATABASE_ECHO` | Enable SQL query logging | `true` (optional) |

## Troubleshooting

### Common Issues

#### **Migration fails with "relation already exists"**
```bash
# Check current migration state
python migrate.py current

# Mark current state without running migrations
python -m alembic stamp head
```

#### **Auto-generation not detecting changes**
1. Ensure model imports are in `migrations/env.py`
2. Check that your models inherit from the correct `Base`
3. Verify database connection is working

#### **Migration rollback fails**
- Check if the downgrade function is properly implemented
- Some changes (like dropping data) might not be reversible
- Consider creating a data backup before complex migrations

### Manual Alembic Commands

If you need more control, use Alembic directly:

```bash
# From the service directory
python -m alembic current
python -m alembic upgrade head
python -m alembic downgrade -1
python -m alembic revision -m "description"
python -m alembic revision --autogenerate -m "description"
python -m alembic history
```

## Integration with Docker

When running in Docker, migrations should be run as part of the container startup:

```dockerfile
# In your Dockerfile or docker-compose.yml
CMD ["sh", "-c", "python migrate.py upgrade && python -m uvicorn app.main:app --host 0.0.0.0 --port 8080"]
```

## Testing

For testing with different databases:

```bash
# SQLite (for testing)
export CA_DATABASE_URL="sqlite:///./test.db"
python migrate.py upgrade

# PostgreSQL (production)
export CA_DATABASE_URL="postgresql://user:pass@localhost:5432/climate_advisor"
python migrate.py upgrade
```
