# MECANET — copilot instructions

Goal: give an AI coding agent the minimal, high‑value knowledge to be productive in this repo.

Goal #2: Always answer in Spanish except when providing code snippets, context, or explanations.

Quick architecture
- Backend: Node.js + Express + Mongoose. Entry: `server.js`; DB connection: `config/db.js`.
- Frontend: React (Vite) in `client/` using Tailwind CSS + Zustand for local app stores.
- Auth: JWT; middleware in `middleware/authMiddleware.js` protects API routes.

Where to look first
- API endpoints: `routes/*.js` -> controllers `controllers/*.js` -> models `models/*.js`.
  Example: `routes/productRoutes.js` -> `controllers/productController.js` -> `models/Product.js`.
- Frontend routes and pages: `client/src/App.jsx`, `client/src/pages/*` (POS flow in `Billing.jsx`).
- Shared patterns: `client/src/services/api.js` (frontend HTTP helper), Zustand stores in `client/src/store/*.js`.

How to run (dev)
- Start backend (root):
  - `npm run dev` or `npm run server` (nodemon -> `server.js`).
- Start frontend (client):
  - `cd client` then `npm run dev` (Vite on 3000/3001).
- Seed DB: `npm run seed` (root) — seeds sample products, users, settings (scripts/seed.js).

Key conventions & patterns (project-specific)
- Controllers implement business logic and return JSON; validation uses `express-validator`.
- Routes are thin: authorize -> validate -> call controller.
  Example: `routes/authRoutes.js` uses `authController.login` and `authMiddleware`.
- Models use Mongoose schemas (see `models/*`): prefer `timestamps` and `populate()` for relations (e.g., product -> supplier).
- Frontend uses small components and page-level state; persistent app state lives in Zustand stores (`authStore.js`, `cartStore.js`, `settingsStore.js`).
- UI utility classes include `card-glass`, `glass-strong` (project visual vocabulary).

Integration points & external dependencies
- MongoDB (MONGO_URI via `.env`), JWT secret in `.env`.
- Frontend calls backend via `client/src/services/api.js` (base URL + token header handling).
- Third-party libs: `lucide-react` for icons, `react-hot-toast` for toasts, `Zustand` for state.

Developer workflows & troubleshooting
- Common scripts (root `package.json`):
  - `npm run dev` (start backend nodemon)
  - `npm run seed` (seed DB)
  - `npm run build` (installs client deps and builds client)
- Use the provided VSCode tasks (Start Backend Server / Start Frontend Dev Server / Start Full Application).
- If frontend HMR shows parsing errors after edits, restart Vite and clear compiled cache; backend uses nodemon so restarts automatically.

Small examples to follow
- Add API route: create `routes/xRoutes.js`, add `controllers/xController.js`, mount in `server.js`.
- Fetch products in frontend: `services/api.js` -> `get('/api/products')`, then store in `client/src/store` or page state.

What NOT to change without domain context
- Receipts formatting and tax logic in `scripts/` and `controllers/saleController.js` — changes affect fiscal output.
- Auth flow and user roles (`models/User.js`, `controllers/authController.js`) — require careful tests.

Files you will use constantly
- `server.js`, `config/db.js`, `routes/*.js`, `controllers/*.js`, `models/*.js`
- `client/src/App.jsx`, `client/src/pages/Billing.jsx`, `client/src/components/Layout/Sidebar.jsx`, `client/src/services/api.js`, `client/src/store/*.js`

If you need more details
- Ask for the exact file/route to change and I will open it and propose targeted edits.
