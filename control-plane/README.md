# SMS Platform Control Plane

The control plane is the web operations layer for the carrier-grade SMS platform in this repository. It provides the tenant dashboard, admin backoffice, NOC console, message trace explorer, compliance tooling, API key lifecycle, campaign operations, wallet visibility, provider health views, and other role-aware workflows on top of the existing NestJS backend.

## Tech Stack

- Next.js 16 with the App Router
- TypeScript
- Tailwind CSS
- TanStack Query for server state
- React Hook Form + Zod for validated forms
- Recharts for dashboard visualizations
- Jest + Testing Library for component and unit tests
- Playwright for end-to-end coverage

## Project Structure

```text
control-plane/
  app/
    (app)/                  Authenticated application routes
    api/                    BFF routes for login, logout, session, proxy, and re-auth
    login/                  Public login experience
    unauthorized/           Permission failure page
  components/
    auth/                   Login form
    ui/                     Shared design system primitives, dialogs, grids, charts
  lib/
    api.ts                  Typed frontend request helpers
    backend.ts              Server-side session and backend fetch helpers
    hooks.ts                React Query resource hooks
    local-persistence.ts    Versioned local persistence helper
    notifications-state.ts  Notifications read-state storage abstraction
    saved-views.ts          Saved-view persistence abstraction
    realtime.ts             Polling/backoff helpers and live status labels
    use-url-filters.ts      URL-synced filter state
  __tests__/                Jest and Testing Library coverage
  e2e/                      Playwright specs and local mock backend
```

## Local Development

Run the backend first from the repository root, then run the control plane in a second shell:

```bash
cd control-plane
npm install
npm run dev
```

By default the app expects the backend API under `BACKEND_BASE_URL`.

For a localhost login, seed the backend from the repo root first:

```bash
node scripts/seed-local-admin.mjs
```

Default local credentials after seeding:

- tenant code: `local`
- email: `admin@example.com`
- password: `ChangeMe123!`

## Required Environment Variables

Copy `.env.example` and set values appropriate for your environment.

- `BACKEND_BASE_URL`
  The backend API base URL, for example `http://127.0.0.1:3000/api/v1`
- `NEXT_PUBLIC_BACKEND_SWAGGER_URL`
  Used for the developer docs page and Swagger deep links
- `NEXT_PUBLIC_APP_ENV`
  UI environment indicator such as `local`, `staging`, or `production`

## Backend Integration Notes

- The control plane talks to the Nest backend through the BFF routes in `app/api`.
- `/api/proxy/[...path]` forwards authenticated requests to the backend and preserves request IDs plus re-auth tokens.
- Protected server-rendered routes resolve the current session through `backend.ts`.
- The frontend uses the backend API contracts as the source of truth for dashboards, campaigns, wallet views, message trace, sender review, provider health, notifications, and search.

## Auth and Session Model

- Login uses `POST /api/auth/login`, which stores the backend bearer token in the `sms_cp_token` HTTP-only cookie.
- The current session is resolved from `GET /api/auth/session`.
- Logout clears the cookie through `POST /api/auth/logout`.
- Cross-tenant operational roles use `POST /api/auth/switch-tenant`.
- Session expiry is handled in the UI by `SessionWatch`, which reacts to 401/403 request events and redirects safely.

## Dangerous-Action Re-Authentication

- High-risk actions use the shared `ConfirmButton` pattern with typed confirmation and password re-authentication.
- The frontend calls `POST /api/auth/re-auth` to mint a short-lived re-auth token.
- The token is forwarded as `x-reauth-token` for guarded backend actions such as API key rotation or revocation, sender approval or rejection, provider circuit overrides, routing changes, pricing changes, retry policy updates, and campaign cancellation.
- Buttons disable while submitting so double-clicks cannot duplicate the action.

## Notifications and Saved Views Persistence

- The backend currently provides the notifications feed itself, but not persistent read or unread state.
- Read state is therefore stored in a versioned, tenant-scoped, user-scoped local storage envelope through `lib/notifications-state.ts`.
- Saved views are also stored locally because the backend does not yet expose user-preference or saved-view APIs.
- Saved views are versioned, user-scoped, tenant-scoped, page-scoped, and resilient to corrupt or legacy local storage data.
- Both persistence layers are isolated behind reusable helpers so they can switch to backend-backed persistence later without rewriting the UI.

## Test Commands

Run unit and component tests:

```bash
npm test
```

Run the full e2e suite:

```bash
npm run test:e2e
```

List Playwright tests without execution:

```bash
npx playwright test --list
```

## Build Commands

```bash
npm run build
npm run start
```

The control plane uses an offline-safe system font stack, so production builds do not require access to Google Fonts.

## E2E and Mock Backend

- `e2e/mock-backend.mjs` provides a local HTTP backend for Playwright runs.
- The mock backend supports login, session, re-authentication, global search, notifications, campaign detail, API key mutations, sender review, and upload error flows used by the UI tests.
- Playwright starts both the mock backend and the Next.js dev server automatically from `playwright.config.ts`.

## Deployment Notes

- The control plane is designed to run behind the same trust boundary as the backend API.
- `sms_cp_token` should remain HTTP-only and `secure` in production.
- Request correlation relies on backend-provided `x-request-id` values.
- Reverse proxies and CDNs should preserve `x-request-id` and not strip `x-reauth-token` from app-to-backend requests.
- Non-production environments should set `NEXT_PUBLIC_APP_ENV` so the app shell shows a visible environment badge.
- The production container uses a standalone Next.js build and exposes `/api/health` for readiness and liveness probes.
- The app uses only offline-safe system fonts, so container builds do not require Google Fonts access.
- For Railway, set `BACKEND_BASE_URL` to the API service private domain and `NEXT_PUBLIC_BACKEND_SWAGGER_URL` to the API public domain. The copy-paste template lives at [RAILWAY_VARIABLES_FRONTEND.env](/C:/Users/Kidus/Documents/sms-platform-backend/RAILWAY_VARIABLES_FRONTEND.env).

## Known Limitations and Assumptions

- Notifications read state is local-only because the backend does not yet expose persistent notification read APIs.
- Saved views are local-only for the same reason.
- The frontend supports re-authentication because the backend now exposes `POST /auth/re-auth`; actions without backend mutation endpoints cannot be made re-auth capable until those endpoints exist.
- Playwright browser binaries are not committed to the repo and may need installation in a fresh environment.

## Troubleshooting

### The app redirects back to login immediately

- Confirm the backend is reachable at `BACKEND_BASE_URL`
- Confirm the backend `POST /auth/login` and `GET /auth/me` routes are working
- Clear stale `sms_cp_token` cookies and sign in again

### Data grids show errors or empty states unexpectedly

- Check the browser network tab for `/api/proxy/...` responses
- Look for the request ID shown in backend errors and logs
- Confirm the selected tenant actually has data in scope for the current role

### Dangerous actions keep failing after password confirmation

- Verify the current password is correct
- Confirm the backend re-auth route is enabled and the action endpoint is guarded with `x-reauth-token`
- Check whether the session expired between confirmation and submission

### Notifications or saved views appear to reset

- Confirm the tenant context or signed-in user changed, because both stores are intentionally user and tenant scoped
- Check local storage availability in the browser
- Clear corrupted local entries and reload if the browser was interrupted mid-write

### E2E tests fail locally

- Run `npx playwright install`
- Ensure port `3001` and `4010` are free
- Confirm the mock backend launches successfully before the Next dev server tries to proxy requests
