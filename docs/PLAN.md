# Login Page Blank Screen Investigation Plan

## Goal Description
Diagnose and provide a fix for the intermittent white screen (blank page) issue that occurs when users attempt to enter the `/login` page. Or alternatively, fix any rendering issues that happen when the user goes from the Login screen to the Dashboard.

## Assessment / Hypothesis
1. **Uncaught Error in Dashboard / Protected Routes causing a React Crash (White Screen of Death)**:
   When an authenticated user visits `/login`, the `Login` page correctly identifies the active session and navigates the user to `/dashboard` immediately (`<Navigate to="/dashboard" replace />`). If an uncaught JavaScript error happens anywhere in the Dashboard or Sidebar, React unmounts the entire app and presents a white screen. There is currently no `ErrorBoundary` component capturing these visual crashes. 
2. **Authentication Timing**:
   The issue is reported as "sometimes I enter it and the page goes blank". This fits perfectly with the fact that if a user has an untampered, valid long-lived session, they will briefly hit `/login`, redirect to `/dashboard`, and if the dashboard has an error reading their `profile` data (which loads asynchronously), it throws a rendering error.

## User Review Required
None required strictly, this follows the orchestrator pattern. Please approve the plan.

## Proposed Changes

### Application Core
We will implement an ErrorBoundary to catch the white screens and show a fallback UI with the error message, and improve the authentication redirects.
#### [NEW] `components/ErrorBoundary.tsx`(file:///c:/Projetos/Business%20Atelie%20Thai%20Lago/Business.AtelieThaiLago/components/ErrorBoundary.tsx)
Create a generic class-based Error Boundary that catches runtime errors and shows a friendly error message instead of a blank white screen.

#### [MODIFY] `App.tsx`(file:///c:/Projetos/Business%20Atelie%20Thai%20Lago/Business.AtelieThaiLago/App.tsx)
Wrap the `<Routes>` in the `ErrorBoundary` so we can see the exact error instead of the white screen.

## Verification Plan

### Automated Tests
Currently, the application does not have an extensive E2E suite, but we'll use Vite dev server to verify components.
npm run dev

### Manual Verification
1. Open the application.
2. Deliberately throw an error in `<Sidebar />` to verify the `ErrorBoundary` appears instead of a white screen.
3. Test the login flow again to ensure a normal login displays the Dashboard.
