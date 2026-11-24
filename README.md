# StockFlow

StockFlow is a multi-tenant inventory MVP built with React, Express, Prisma, and SQLite. Every signed-in request derives its organization from the authenticated user; organization IDs are never accepted from the client.

## Features

- Email/password signup and login with bcrypt hashes and an HTTP-only JWT session cookie.
- Organization creation during signup, with one account per organization.
- Tenant-scoped product create, list, detail, update, and delete endpoints.
- Product validation, organization-local unique SKUs, name/SKU search, and quantity editing.
- Dashboard totals and low-stock calculation using product overrides, organization settings, then a fallback threshold of 5.
- Organization-specific default low-stock setting.
- Responsive React interface served by Express in production.

## Stack And Structure

```text
prisma/schema.prisma       Organization, User, Product models
prisma/migrations/         Deployable database migration
server/index.js            Express API, authentication, and production static hosting
src/App.jsx                React screens and API workflows
src/App.css                Application styling
test/api.test.js           Isolated API and tenant-isolation integration test
```

## Local Setup

Requirements: Node.js 20.19+ or 22.12+, npm, and no separate database service for local development.

1. Copy `.env.example` to `.env` and set a unique `JWT_SECRET`.
2. Install packages with `npm install`.
3. Create/update the local SQLite database with `npm run db:push`.
4. Start the frontend and API with `npm run dev`.
5. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

The Vite server proxies `/api` requests to Express on port 3001. The default local database is `prisma/stockflow.db`.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma SQLite URL, e.g. `file:./stockflow.db` locally or `file:/var/data/stockflow.db` on a persistent server volume. |
| `JWT_SECRET` | Yes in production | Long, random signing key. A local-only development fallback exists; production startup fails without this variable. |
| `PORT` | No | Express listen port; defaults to `3001`. |
| `NODE_ENV` | No | Set to `production` to enable secure cookies and serve the built frontend. |

## API

All product, dashboard, and settings endpoints require the session cookie.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an organization and its user, then sign in. |
| POST | `/api/auth/login` | Verify credentials and sign in. |
| POST | `/api/auth/logout` | Clear the session cookie. |
| GET | `/api/auth/me` | Return the current user and organization. |
| GET | `/api/products` | List tenant products, including effective low-stock state. |
| POST | `/api/products` | Create a tenant product. |
| GET | `/api/products/:id` | Read a tenant product. |
| PUT | `/api/products/:id` | Update a tenant product. |
| DELETE | `/api/products/:id` | Delete a tenant product. |
| GET | `/api/dashboard` | Read organization-scoped inventory totals and low-stock items. |
| GET | `/api/settings` | Read organization settings. |
| PUT | `/api/settings` | Update the default low-stock threshold. |

## Database Schema

- `Organization`: name, creation timestamp, and default low-stock threshold.
- `User`: unique email, bcrypt password hash, and a one-to-one organization relation.
- `Product`: inventory and price fields with organization relation, timestamps, organization/SKU composite unique constraint, and organization index.

## Checks

```powershell
npm test
npm run lint
npm run build
```

The integration test creates an isolated SQLite database and verifies signup/login/logout, invalid credentials and fields, duplicate email/SKU, product operations, default and per-product thresholds, dashboard totals, and cross-organization read/update/delete protection.

## Deployment

Deploy on a Node host with a persistent disk mounted at `/var/data` (SQLite requires persistent local storage). Configure:

```text
DATABASE_URL=file:/var/data/stockflow.db
JWT_SECRET=<long-random-secret>
NODE_ENV=production
```

Use `npm install` as the install step, `npm run build` as the build step, `npm run db:migrate` as the release/pre-deploy step, and `npm start` as the start command. Set `PORT` only if the host does not provide it. The API server serves `dist/` and the SPA from the same origin, so session cookies remain first-party.

For local development, `npm run db:push` is convenient. Production uses the checked-in migration through `npm run db:migrate`; do not run `db:push` against production data.

## Submission Status

The app and deployment configuration are prepared, but no public GitHub repository or hosted live URL has been created from this workspace. Those require a GitHub remote/account and a deployment provider with a persistent-volume allocation and production secrets.