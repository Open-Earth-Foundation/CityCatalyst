
# POC Modules Architecture

## Overview

The POC (Proof of Concept) modules system in CityCatalyst provides a secure, isolated environment for experimental features while maintaining access to core platform capabilities like authentication and database resources.

## Architecture Design

### File Structure

```
app/src/app/[lng]/pocs/
├── layout.tsx          # Shared layout with navigation and styling
├── page.tsx           # POC directory listing and module registry
└── [module-name]/
    ├── page.tsx       # Main module entry point
    ├── components/    # Module-specific components (optional)
    ├── utils/         # Module-specific utilities (optional)
    └── types.ts       # Module-specific types (optional)
```

### Isolation Strategy

#### 1. **File System Isolation**
- POC modules are contained within `/app/src/app/[lng]/pocs/` directory
- Each module exists in its own subdirectory with no cross-module dependencies
- Module-specific assets are self-contained within their respective folders

#### 2. **Route Isolation**
- Next.js App Router automatically maps each module to `/pocs/[module-name]`
- No manual routing configuration required
- Clean URL structure: `https://citycatalyst.openearth.dev/en/pocs/hello`

#### 3. **Component Isolation**
- Modules cannot import from `/app/core/*` (enforced by ESLint rules)
- No direct imports between POC modules
- Self-contained component trees

### Core Platform Integration

#### Authentication Integration
```typescript
// app/src/app/[lng]/pocs/hello/page.tsx
import { Auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HelloPage({ params }: { params: { lng: string } }) {
  const session = await Auth.getServerSession();
  
  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  // Access user data: session.user?.name, session.user?.id, session.user?.role
  return (
    <main>
      <h1>Hello, {session.user?.name}!</h1>
    </main>
  );
}
```

#### Database Access Pattern
```typescript
// Example: Module accessing database through existing services
import { ActivityService } from "@/backend/ActivityService";
import { InventoryService } from "@/backend/InventoryService";

// Modules use existing backend services for data access
const userInventories = await InventoryService.getUserInventories(session.user.id);
const activities = await ActivityService.getActivitiesByInventory(inventoryId);
```

#### Styling Integration
```typescript
// Modules inherit global styles and can use:
// - Tailwind CSS classes
// - Chakra UI components (via providers)
// - Custom theme variables
// - Global CSS variables from app/globals.css
```

### Security & Access Control

#### Authentication Requirements
- All POC modules require authentication by default
- Unauthenticated users are redirected to login
- Session validation happens server-side using NextAuth

#### Permission Structure
```typescript
// Role-based access can be implemented per module
const session = await Auth.getServerSession();

if (!session || !hasRequiredPermissions(session.user, 'poc_access')) {
  return <NoAccess />;
}
```

#### Data Access Security
- Database access goes through existing service layers
- No direct database connections in POC modules
- Inherits existing RLS (Row Level Security) policies
- User context automatically applied through session

### Scaling Strategy

#### Adding New Modules

1. **Create Module Directory**
```bash
mkdir -p app/src/app/[lng]/pocs/[new-module-name]
```

2. **Create Page Component**
```typescript
// app/src/app/[lng]/pocs/[new-module-name]/page.tsx
import { Auth } from "@/lib/auth";
import { redirect } from "next/navigation";

interface NewModulePageProps {
  params: { lng: string };
}

export default async function NewModulePage({ params }: NewModulePageProps) {
  const session = await Auth.getServerSession();
  
  if (!session) {
    redirect(`/${params.lng}/auth/login`);
  }

  return (
    <main className="container mx-auto p-8">
      {/* Module content */}
    </main>
  );
}
```

3. **Register in Module Index**
```typescript
// app/src/app/[lng]/pocs/page.tsx
const pocModules = [
  {
    name: "Hello Module",
    path: "hello",
    description: "Simple greeting module demonstrating POC structure",
    status: "Active"
  },
  {
    name: "New Module",
    path: "new-module-name",
    description: "Description of new module functionality",
    status: "Development"
  }
  // Add new modules here
];
```

#### Module Types & Templates

**Basic Module Template:**
```typescript
// Standard authenticated page with user context
export default async function ModulePage({ params }) {
  const session = await Auth.getServerSession();
  if (!session) redirect(`/${params.lng}/auth/login`);
  
  return <ModuleContent user={session.user} />;
}
```

**Data-Heavy Module Template:**
```typescript
// Module that needs database access
export default async function DataModulePage({ params }) {
  const session = await Auth.getServerSession();
  if (!session) redirect(`/${params.lng}/auth/login`);
  
  const userCities = await CityService.getUserCities(session.user.id);
  const inventories = await InventoryService.getUserInventories(session.user.id);
  
  return <DataVisualization cities={userCities} inventories={inventories} />;
}
```

**Admin Module Template:**
```typescript
// Module requiring elevated permissions
export default async function AdminModulePage({ params }) {
  const session = await Auth.getServerSession();
  if (!session || session.user.role !== 'admin') {
    redirect(`/${params.lng}/auth/login`);
  }
  
  return <AdminInterface />;
}
```

### Development Workflow

#### 1. Local Development
```bash
cd app
npm run dev
# Navigate to http://localhost:3000/en/pocs/[module-name]
```

#### 2. Testing Strategy
- Unit tests for module-specific logic
- Integration tests for database interactions
- E2E tests for user workflows
- Isolated test environment per module

#### 3. Deployment Process
```bash
# POC modules deploy with main application
git add app/src/app/[lng]/pocs/[module-name]
git commit -m "feat(poc): add [module-name] module"
git push origin feature-branch
```

### Module Lifecycle Management

#### Development Status Tracking
```typescript
interface POCModule {
  name: string;
  path: string;
  description: string;
  status: 'Development' | 'Testing' | 'Active' | 'Deprecated';
  author?: string;
  created?: string;
  lastUpdated?: string;
}
```

#### Graduation to Core Features
When a POC module proves successful:

1. **Code Review & Refactoring**
   - Move from `/pocs/` to appropriate core location
   - Add comprehensive tests
   - Update routing and navigation

2. **Documentation Update**
   - Add to main feature documentation
   - Update user guides
   - Remove from POC registry

3. **Cleanup**
   - Remove POC version
   - Update any references
   - Archive POC development history

### Performance Considerations

#### Bundle Size Management
- POC modules are code-split automatically by Next.js
- Each module loads independently
- No impact on main application bundle size

#### Database Connection Pooling
- Shared connection pool with main application
- No additional database overhead
- Existing connection limits apply

#### Caching Strategy
- POC modules inherit Next.js caching behavior
- Server-side rendering with automatic static optimization
- API routes can implement custom caching as needed

### Monitoring & Analytics

#### Error Tracking
```typescript
// POC modules can include error boundaries
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function POCModuleLayout({ children }) {
  return (
    <ErrorBoundary fallback={<POCErrorFallback />}>
      {children}
    </ErrorBoundary>
  );
}
```

#### Usage Analytics
- Track module adoption through existing analytics
- Monitor performance metrics
- Collect user feedback for iteration

## Benefits of This Architecture

1. **Risk Mitigation**: Isolated modules cannot break core functionality
2. **Rapid Prototyping**: Fast iteration without impacting production
3. **Resource Sharing**: Access to auth, database, and UI components
4. **Seamless Integration**: Consistent user experience across modules
5. **Easy Cleanup**: Simple removal of unsuccessful experiments
6. **Scalable Growth**: No architectural changes needed for new modules

## Example Use Cases

- **Data Visualization Experiments**: New chart types or dashboard layouts
- **Feature Prototypes**: Testing new workflows before core integration
- **User Research**: A/B testing new interface patterns
- **Integration Testing**: Validating third-party service connections
- **Client Demos**: Showcase potential features to stakeholders

This architecture provides a robust foundation for experimental development while maintaining the security and reliability of the core CityCatalyst platform.
