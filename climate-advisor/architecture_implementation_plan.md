---

## Sprint 1: Climate Advisor Service Foundation

### Sprint Goal

Establish the foundation for the Climate Advisor Service microservice and begin the migration from direct OpenAI integration.

### Developer Capacity: 1 Developer (2 weeks)

### Tickets

#### **TICKET-001: Climate Advisor Service Setup**

**Priority:** High  
**Story Points:** 8  
**Description:** Create the initial Climate Advisor Service Python microservice with FastAPI framework.

**Acceptance Criteria:**

- [ ] Set up FastAPI project structure following the project layout guidelines
- [ ] Create basic health check endpoint (`/health`)
- [ ] Implement Docker containerization with Dockerfile
- [ ] Add basic logging and error handling
- [ ] Create requirements.txt with FastAPI, uvicorn, and other dependencies
- [ ] Add environment configuration for service discovery

**Files to Create:**

- `global-api/app/main.py` (Climate Advisor Service entry point)
- `global-api/requirements.txt` (Climate Advisor Service dependencies)
- `global-api/Dockerfile`
- `global-api/app/services/` (service layer structure)

---

#### **TICKET-002: OAuth Integration for Climate Advisor Service**

**Priority:** High  
**Story Points:** 5  
**Description:** Implement OAuth token management for the Climate Advisor Service to authenticate with CityCatalyst.

**Acceptance Criteria:**

- [ ] Create OAuth client configuration
- [ ] Implement token acquisition from OAuth Provider
- [ ] Add token refresh mechanism
- [ ] Create secure token storage (environment variables or secure config)
- [ ] Add token validation and error handling

**Files to Create/Modify:**

- `global-api/app/services/oauth_service.py`
- `global-api/app/config/oauth_config.py`
- `global-api/.env.example` (OAuth configuration)

---

#### **TICKET-003: Basic API Endpoints Structure**

**Priority:** Medium  
**Story Points:** 3  
**Description:** Create the basic API endpoint structure for the Climate Advisor Service following the proposed v1 contract.

**Acceptance Criteria:**

- [ ] Implement `/v1/threads` endpoint (POST)
- [ ] Implement `/v1/messages` endpoint (POST with streaming support)
- [ ] Add basic request/response models with Pydantic
- [ ] Implement proper HTTP status codes and error responses
- [ ] Add API documentation with FastAPI auto-generated docs

**Files to Create:**

- `global-api/app/routes/threads.py`
- `global-api/app/routes/messages.py`
- `global-api/app/models/requests.py`
- `global-api/app/models/responses.py`

---

#### **TICKET-004: CityCatalyst API Client**

**Priority:** Medium  
**Story Points:** 5  
**Description:** Create HTTP client for Climate Advisor Service to communicate with CityCatalyst API.

**Acceptance Criteria:**

- [ ] Implement HTTP client with OAuth token authentication
- [ ] Add retry logic and timeout handling
- [ ] Create methods for context data retrieval from CityCatalyst
- [ ] Add proper error handling for API failures
- [ ] Implement request/response logging

**Files to Create:**

- `global-api/app/services/citycatalyst_client.py`
- `global-api/app/models/citycatalyst_models.py`

---

#### **TICKET-005: Environment Configuration and Documentation**

**Priority:** Low  
**Story Points:** 2  
**Description:** Set up comprehensive environment configuration and update documentation.

**Acceptance Criteria:**

- [ ] Create comprehensive `.env.example` with all required variables
- [ ] Update README.md with setup and deployment instructions
- [ ] Add Docker Compose configuration for local development
- [ ] Document API endpoints and integration points
- [ ] Add troubleshooting guide

**Files to Create/Modify:**

- `global-api/.env.example`
- `global-api/README.md`
- `global-api/docker-compose.yml`
- `docs/climate-advisor-service.md`

---

### Sprint 1 Definition of Done

- [ ] All tickets completed and tested locally
- [ ] Docker containers build and run successfully
- [ ] Basic API endpoints respond correctly
- [ ] OAuth integration works with test credentials
- [ ] Documentation is complete and up-to-date
- [ ] Code review completed
- [ ] No critical security vulnerabilities

### Dependencies for Sprint 2

- OAuth Provider credentials and configuration
- CityCatalyst API documentation for context data endpoints
- OpenRouter API credentials and configuration
