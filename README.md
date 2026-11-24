# StockFlow

A simple inventory management app for tracking products, stock levels, and low-stock items.

**Live demo:** [stockflow-3bos.onrender.com](https://stockflow-3bos.onrender.com)  



## Features

- Create an account and organization, then sign in securely.
- Add, view, edit, search, and delete products.
- Track SKUs, quantities, costs, and selling prices.
- See inventory totals and low-stock items on the dashboard.
- Set organization-wide or product-specific low-stock thresholds.
- Keep organization data isolated between accounts.

## Tech stack

- React and Vite
- Express
- Prisma and SQLite
- bcrypt password hashing, JWT sessions, and Zod validation

## Run locally

**Requirements:** Node.js 20.19+ (or 22.12+) and npm.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/pavank025k/stockflow.git
   cd stockflow
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   DATABASE_URL="file:./stockflow.db"
   JWT_SECRET="replace-with-a-unique-local-secret"
   PORT=3001
   ```

   Use a strong, unique `JWT_SECRET` in production. Don’t use a sample or development secret.

3. Set up the local database and start the app:

   ```bash
   npm run db:push
   npm run dev
   ```

4. Open the Vite URL printed in your terminal, usually `http://localhost:5173`.

The Vite development server proxies API requests to Express on port `3001`.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API and frontend for development |
| `npm run build` | Build the frontend for production |
| `npm start` | Start the Express server |
| `npm run db:push` | Update the local SQLite schema |
| `npm run db:migrate` | Apply checked-in Prisma migrations |
| `npm test` | Run the test suite |
| `npm run lint` | Run Oxlint |

## Deploy on Render

Create a **Web Service** from this GitHub repository and configure:

| Setting | Value |
| --- | --- |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm run db:migrate && npm start` |

Add these environment variables in Render:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `file:./stockflow.db` |
| `JWT_SECRET` | A strong, unique random secret |

Render provides the `PORT` variable automatically.

The free service does not provide persistent SQLite storage. For durable production data, use a persistent disk with SQLite or migrate the app to a managed database.

## API

Product, dashboard, and settings routes require a signed-in session.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Create an account and organization |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Get the current user |
| `GET` | `/api/products` | List products |
| `POST` | `/api/products` | Create a product |
| `GET` | `/api/products/:id` | Get a product |
| `PUT` | `/api/products/:id` | Update a product |
| `DELETE` | `/api/products/:id` | Delete a product |
| `GET` | `/api/dashboard` | Get inventory totals and low-stock items |
| `GET` | `/api/settings` | Get organization settings |
| `PUT` | `/api/settings` | Update the default low-stock threshold |

## Project structure

```text
prisma/
  schema.prisma       Database models and configuration
  migrations/         Deployable database migrations
server/
  index.js            Express API and production static hosting
src/
  App.jsx             React application
  App.css             Application styles
test/
  api.test.js         API integration tests
```
