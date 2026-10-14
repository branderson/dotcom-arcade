# Views and Routing

Complete documentation of all views, routes, and route protection in the
Dotcom Arcade frontend.

## Route Structure

```
/                         → HomeView (discovery homepage)
/login                    → LoginView (no auth required)
/register                 → RegisterView (no auth required)
/unauthorized             → UnauthorizedView

# Game Views (Public/Guest Accessible)
/browse                   → BrowseView
/animations               → AnimationsView
/browse/:id               → GamePage (also /animations/:id, /games/:id)
/flash/*, /html5/*        → Redirect to the same path under /browse

# Protected Routes (Auth Required)
/browse/:id/play          → GamePage, game started (requires "games.play")
/dashboard                → DashboardView
/favorites                → FavoritesView
/playlists                → UserPlaylistsView
/playlists/:id            → UserPlaylistDetailView
/flashpoint-playlists     → PlaylistsView
/settings                 → SettingsView

# Admin Routes (Permission-Based)
/users                    → UsersView (requires "users.read")
/roles                    → RolesView (requires "roles.read")
/activities               → ActivitiesView (requires "activities.read")
```

## Layouts

Public routes (home, browse, game and player pages, favorites, playlists,
downloaded, dashboard) render in `PortalLayout`; settings and admin routes
render in `MainLayout` with the sidebar. See
[Discovery Portal](../10-features/12-discovery-portal.md).

## Route Protection

### ProtectedRoute Component

All routes use the `ProtectedRoute` component for authorization:

**Location:** `frontend/src/components/auth/ProtectedRoute.tsx`

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean; // Default: true
  requirePermission?: string; // Single permission
  requireAnyPermission?: string[]; // Any of these
  requireAllPermissions?: string[]; // All of these
}
```

### Protection Levels

**1. Public Routes** - `requireAuth={false}`

```typescript
<Route path="/browse" element={
  <ProtectedRoute requireAuth={false}>
    <BrowseView />
  </ProtectedRoute>
} />
```

**2. Authenticated Routes** - Default behavior

```typescript
<Route path="/dashboard" element={
  <ProtectedRoute>
    <DashboardView />
  </ProtectedRoute>
} />
```

**3. Permission-Based Routes**

```typescript
<Route path="/games/:id/play" element={
  <ProtectedRoute requirePermission="games.play">
    <GamePlayerView />
  </ProtectedRoute>
} />
```

## Key Views

### BrowseView

Main game browsing view with full filtering.

**Features:**

- Multi-filter sidebar (Platform, Tags, Play Mode, Library)
- Search bar
- Sort options
- View mode toggle (Grid/List)
- Card size control
- Pagination

### GameDetailView

Detailed game information page.

**Features:**

- Game metadata (title, developer, publisher, release date)
- Screenshots and logos
- Tags and categories
- Related games
- Play button (if authenticated)
- Add to favorites/playlists

### GamePlayerView

Full-screen game player.

**Features:**

- Flash/HTML5 game rendering
- Fullscreen mode
- Play session tracking
- ESC to exit fullscreen
- Requires "games.play" permission

### DashboardView

User statistics dashboard.

**Features:**

- Total games played
- Total playtime
- Top games chart
- Activity over time
- Games distribution chart
- Recent play sessions

### PlaylistsView

User playlists management.

**Features:**

- Create new playlists
- Browse community playlists
- Delete playlists
- View playlist details

### UsersView / RolesView / ActivitiesView

Admin management views.

**Features:**

- User management (create, edit, delete, change password)
- Role management with permission assignment
- Activity logs with filtering
- Requires specific admin permissions

## Route Configuration

Routes are configured in `App.tsx`:

```typescript
<Routes>
  {/* Auth routes (no AppShell) */}
  <Route path="/login" element={<LoginView />} />
  <Route path="/register" element={<RegisterView />} />
  <Route path="/unauthorized" element={<UnauthorizedView />} />

  {/* Main app routes (with AppShell) */}
  <Route path="/*" element={
    <AppShell>
      <Routes>
        {/* Public routes */}
        <Route path="/browse" element={
          <ProtectedRoute requireAuth={false}>
            <BrowseView />
          </ProtectedRoute>
        } />

        {/* Protected routes */}
        <Route path="/games/:id/play" element={
          <ProtectedRoute requirePermission="games.play">
            <GamePlayerView />
          </ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/users" element={
          <ProtectedRoute requirePermission="users.read">
            <UsersView />
          </ProtectedRoute>
        } />
      </Routes>
    </AppShell>
  } />
</Routes>
```

## Navigation

Navigation is handled by React Router:

```typescript
import { useNavigate, Link } from 'react-router-dom';

// Programmatic navigation
const navigate = useNavigate();
navigate('/games/123');

// Link navigation
<Link to="/games/123">View Game</Link>
```

## Further Reading

- [Component Overview](./components/component-overview.md)
- [Auth Components](./components/auth-components.md)
- [Protected Route Implementation](./components/auth-components.md#protectedroute)
