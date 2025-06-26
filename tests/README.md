# Testing Documentation

This directory contains the test suite for the HIAP (High Impact Actions Prioritizer) application.

## Setup

### Install Dependencies

```bash
# Install dev dependencies including pytest
pip install -r requirements-dev.txt
```

## Test Structure

```
tests/
├── conftest.py          # Shared fixtures and configuration
├── unit/                # Unit tests for individual functions
│   ├── test_build_city_data.py
│   ├── test_models.py
│   └── test_services.py
├── integration/         # Integration tests for API endpoints
│   ├── test_api_health.py
│   └── test_prioritizer_api.py
└── README.md           # This file
```

## Test Categories

Tests are organized using pytest markers:

- `@pytest.mark.unit` - Fast unit tests for individual functions
- `@pytest.mark.integration` - Integration tests for API endpoints
- `@pytest.mark.slow` - Longer running tests
- `@pytest.mark.external` - Tests requiring external services

## Running Tests

### Basic Commands

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Run tests excluding slow ones
pytest -m "not slow"
```

### Using Makefile

```bash
# Install test dependencies
make install-test

# Run all tests
make test

# Run unit tests only
make test-unit

# Run integration tests only
make test-integration

# Run with coverage report
make test-cov

# Run fast tests only
make test-fast
```

## Coverage Reports

```bash
# Generate HTML coverage report
pytest --cov=app --cov-report=html

# View coverage in browser
open htmlcov/index.html
```

## Test Examples

### Unit Test Example

Tests individual functions in isolation with mocked dependencies:

```python
def test_build_city_data_with_complete_data(sample_city_context, sample_request_data):
    result = build_city_data(sample_city_context, sample_request_data)
    assert result["locode"] == "BRRIO"
    assert result["totalEmissions"] == 4950.0
```

### Integration Test Example

Tests API endpoints with FastAPI test client:

```python
def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
```

### Mocked Service Test Example

Tests external API calls with mocked responses:

```python
@patch('services.get_actions.requests.Session')
def test_get_actions_success(mock_session):
    # Setup mock
    mock_response = Mock()
    mock_response.json.return_value = [{"ActionID": "TEST001"}]
    mock_session.return_value.get.return_value = mock_response

    # Test
    result = get_actions()
    assert len(result) == 1
```

## Writing New Tests

### Guidelines

1. **Use descriptive test names** that explain what is being tested
2. **Follow the AAA pattern**: Arrange, Act, Assert
3. **Use fixtures** for common test data (defined in `conftest.py`)
4. **Mock external dependencies** to make tests fast and reliable
5. **Test both success and failure cases**
6. **Mark tests appropriately** with pytest markers

### Common Fixtures Available

- `client` - FastAPI test client
- `sample_city_context` - Sample city context data
- `sample_request_data` - Sample request data with emissions
- `sample_climate_action` - Sample climate action data
- `sample_city_data_request` - Complete city data request for APIs

### Adding New Fixtures

Add new fixtures to `conftest.py`:

```python
@pytest.fixture
def my_fixture():
    return {"key": "value"}
```

## Configuration

Test configuration is in `pytest.ini`:

- Coverage settings
- Test discovery patterns
- Marker definitions
- Output formatting

## Troubleshooting

### Import Errors

If you see import errors, ensure you're running tests from the project root and the app directory is in your Python path.

### Async Tests

For testing async endpoints, use:

```python
@pytest.mark.asyncio
async def test_async_endpoint():
    # Test async code
```

### Environment Variables

Tests run with environment variables from `.env` file. For test-specific variables, use:

```python
@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv("TEST_VAR", "test_value")
```
