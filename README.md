# FoodieGo

FoodieGo is a responsive MERN food-ordering application for a university demonstration and portfolio. It uses React/Vite, Express, MongoDB, and Mongoose. The project keeps restaurant and menu fixtures clearly identified as demo data; it is not connected to live restaurant partners or a delivery fleet.

## Features

- Customer registration/login with bcrypt password hashing and expiring JWT sessions.
- City and neighborhood selection, persisted light/dark theme, restaurant search, cuisine/area filters, dish search, and price sorting.
- Menu details, local saved favorites, quantity controls, and a one-restaurant cart.
- COD checkout, server-priced orders, order history, and status tracking.
- Protected admin workspace with database-backed counts/revenue, most-ordered dish summary, order status management, and restaurant/menu CRUD including availability.
- Sample catalog data across Chandigarh and Punjab cities. Demo restaurant, rating, menu, and delivery data are labeled and are not verified partner information.

## Screenshots

Add your own screenshots here after running the project, for example a desktop homepage, mobile restaurant discovery page, cart/checkout, and admin dashboard. Capture screens using the demo database so no private customer information is shown.

See [the project guide](docs/project-guide.md) for the architecture, data model, local setup, API areas, and university demonstration checklist.

## Requirements and configuration

Use Node.js 18+ and a reachable MongoDB Community or Atlas database. Copy `server/.env.example` to `server/.env`, then set:

- `MONGO_URI`: local MongoDB URL or private Atlas connection string.
- `JWT_SECRET`: a long, unique secret; never commit the real `.env` file.
- `JWT_EXPIRES_IN`: token lifetime such as `7d`.
- `PORT`: API port (defaults to `5001`).
- `CLIENT_URL`: allowed frontend origin. For local development, use `http://localhost:5173`.

The frontend uses `http://localhost:5001/api` by default. Set `VITE_API_URL` at frontend build time when the API is hosted elsewhere.
For a custom frontend API URL, copy `client/.env.example` to `client/.env.local` and set `VITE_API_URL` before starting/building Vite. The local example is already configured for this project's API on port `5001`.

## Install and run
```sh
npm install
npm run install:all
npm run seed
npm run seed:punjab
npm run seed:chandigarh
npm run dev
```
Frontend: http://localhost:5173 · API: http://localhost:5001/api · Health: http://localhost:5001/api/health. The seeded restaurant names and listings are local demo fixtures, not verified business partners.

Run independently with `npm run dev --prefix server` and `npm run dev --prefix client`.

`npm run seed` resets collections in the configured database; only run it against a disposable demo database. The two city seed commands are additive and safe to rerun. Run `npm test` for the server pricing and order validation tests, and `npm run build --prefix client` for the production frontend build.

## Demo accounts
Seeded local admin: `admin@foodiego.local` / `FoodieGo123!`.
Customer: `maya@example.com` / `FoodieGo123!`. Change/remove these credentials before exposing a deployment.

## API overview
Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile`; restaurants: `GET /api/restaurants?city=Ludhiana&area=Sarabha%20Nagar` (also Chandigarh, Amritsar, Jalandhar, Patiala, Bathinda, and Mohali), `GET/POST /api/restaurants`, `GET/PUT/DELETE /api/restaurants/:id`; foods: `GET /api/foods?city=Amritsar&area=Ranjit%20Avenue`, `GET/POST /api/foods`, `GET/PUT/DELETE /api/foods/:id`; categories: `GET/POST /api/categories`, `DELETE /api/categories/:id`; orders: `GET/POST /api/orders`, `GET /api/orders/:id`, `PUT /api/orders/:id/status`; users: `GET /api/users`, `PUT /api/users/profile`; admin stats: `GET /api/admin/stats`. Protected routes require `Authorization: Bearer <token>`; mutations require admin unless creating an order or editing own profile. Admin food listing may use `?includeUnavailable=true` to include paused menu entries.

## Notes
`npm run seed` clears the demo database collections and inserts fresh demo accounts, the original 10 restaurant fixtures, categories, and 20 menu items. Follow it with `npm run seed:punjab` to add 15 sample restaurants and 30 menu items across Ludhiana, Jalandhar, Patiala, Bathinda, and Mohali, and `npm run seed:chandigarh` to add six Chandigarh demo listings with 12 sample dishes. Both city seeders are additive and safe to rerun; they preserve users, orders, and existing catalog entries. Use these scripts only against the local FoodieGo database. Restaurant listings, menus, ratings, and availability are sample data, not verified business partners or live delivery coverage. The app remembers theme and delivery city/neighborhood, and filters restaurants and foods by location. Images use external Unsplash URLs; replace with owned assets or an upload service for production. Payment is Cash on Delivery only. Orders are limited to one restaurant and charge ₹39 delivery below ₹599. Configure `CLIENT_URL` for your deployed frontend. Add rate limiting, email verification, password reset, image storage, and payment provider integration before production.

This demo does not apply tax or promotional discounts because no jurisdiction-specific tax rule or discount campaign is configured; it calculates the database-priced subtotal, ₹39 delivery below ₹599, and final COD total. Do not use these sample rates as production pricing. No online payment provider is configured. For deployment, host the API and frontend separately, use a private MongoDB database, set `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CLIENT_URL`, and frontend `VITE_API_URL` in the hosting provider, seed only a clean demo database, and verify the health endpoint and allowed CORS origin before sharing the site.
