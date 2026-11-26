# KORTRIX ONE — Production Deployment & Self-Hosting Guide

## 1. Important Note About Secrets & Downloading
Secrets saved in AI Studio (**Settings -> Secrets**) are **never included** when you download the project archive. When deploying to your own server (cPanel, VPS, or Docker), you must configure your environment variables on the server by either:
- Copying `.env.example` to `.env` in the app root (never commit `.env` to Git), **or**
- Adding the variables in your host's panel (e.g., **cPanel -> Setup Node.js App -> Environment Variables**).

| Variable | Required in Production | Purpose |
| :--- | :--- | :--- |
| `OWNER_EMAIL` | Optional | Owner account email (defaults to `dylan@kortrix.com`) |
| `OWNER_NAME` | Optional | Owner display name (defaults to `Dylan`) |
| `OWNER_ADMIN_PASSCODE` | **Yes** (or set via CLI/SQL) | Strong Owner password (min 12 chars); automatically salted-scrypt hashed into `users.password_hash` on startup |
| `OWNER_PASSCODE_SYNC` | Optional | Set to `true` temporarily to overwrite `users.password_hash` on next restart after rotating `OWNER_ADMIN_PASSCODE` |
| `MYSQL_HOST` | Recommended | `localhost` when hosted directly on your cPanel server; public host/IP if hosted remotely |
| `MYSQL_PORT` | Recommended | Usually `3306` |
| `MYSQL_USER` | Recommended | cPanel MySQL database username |
| `MYSQL_PASSWORD` | Recommended | cPanel MySQL database password |
| `MYSQL_DATABASE` | Recommended | cPanel MySQL database name |
| `MYSQL_SSL` | Optional | `false` or `true` depending on cPanel TLS enforcement |
| `PUBLIC_INTAKE_API_KEY` | Optional | Shared secret header (`X-Kortrix-Intake-Key`) for `kortrix.com` -> `POST /api/public/service-requests` |
| `AZURE_TENANT_ID` | Optional | Microsoft Entra ID Directory (tenant) ID |
| `AZURE_CLIENT_ID` | Optional | Microsoft Entra ID Application (client) ID |
| `AZURE_CLIENT_SECRET` | Optional | Microsoft Entra ID client secret |
| `AZURE_REDIRECT_URI` | Optional | `https://one.kortrix.com/api/auth/entra/callback` |

## 2. Production Security Posture
- **No Public Owner Setup Page**: There is no unauthenticated account-claiming screen. Sign-in only unlocks once `OWNER_ADMIN_PASSCODE` is set in environment variables, a password hash is provisioned via CLI/SQL, or Microsoft Entra ID SSO is configured.
- **No Plaintext Passwords in SQL Files**: `docs/mysql_schema.sql` seeds the `user-founder` Owner account with `password_hash = NULL`. The server automatically hashes `OWNER_ADMIN_PASSCODE` with salted `scrypt` into `users.password_hash` on boot, or you can generate a safe `UPDATE` statement for phpMyAdmin with `npm run owner:sql`.
- **Minimal Health & Auth Status Endpoints**: `GET /api/health` and `GET /api/auth/status` expose no database diagnostics, internal emails, or environment flags to unauthenticated callers.
- **No-Cache API Responses**: All `/api/*` responses include `Cache-Control: no-store, private` and HSTS headers over HTTPS.
- **Graceful Shutdown**: Handles `SIGTERM`/`SIGINT`, cleanly closing MySQL pools and SQLite handles.

## 3. Setting Up MySQL in cPanel phpMyAdmin (Optional Pre-Seed)
1. Open **cPanel -> phpMyAdmin**, select your database, click **Import**, and upload `docs/mysql_schema.sql`.
   - This creates all 23 tables and idempotently seeds the Owner account (`dylan@kortrix.com`), 9 departments, 10 roles, 19 official services, company defaults, and launch roadmap tasks.
2. When your Node.js app starts with `MYSQL_*` and `OWNER_ADMIN_PASSCODE` set, it automatically hashes `OWNER_ADMIN_PASSCODE` and writes it to `users.password_hash` (and updates the Owner email if `OWNER_EMAIL` is set).
3. *(Optional)* To set or rotate the Owner password directly in phpMyAdmin without keeping `OWNER_ADMIN_PASSCODE` in `.env`, run locally:
   ```bash
   npm run owner:sql
   ```
   Then paste the printed `UPDATE users ...` statement (containing a freshly salted `scrypt` hash) into phpMyAdmin's **SQL** tab.

## 4. Building & Uploading to Your Server (cPanel / VPS)
1. Install dependencies and compile both the frontend (`dist/`) and standalone Node.js server (`dist/server.mjs`):
   ```bash
   npm install
   npm run build
   ```
2. Upload the project to your server (excluding `node_modules/` and local `data/`), then run `npm install --omit=dev` (or run `npm install` via cPanel's **Run NPM Install** button).
3. Configure your environment variables in `.env` or cPanel's **Setup Node.js App** panel (with `NODE_ENV=production` and `MYSQL_HOST=localhost` on cPanel).
4. Set the **Application startup file** to:
   ```text
   dist/server.mjs
   ```
   Or start directly via CLI:
   ```bash
   npm run start:prod
   ```
5. *(Optional)* To update the Owner password directly in MySQL/SQLite from SSH:
   ```bash
   npm run owner:password
   ```

## 5. Running via Docker
```bash
docker build -t kortrix-one .
docker run -p 3000:3000 --env-file .env -v kortrix_data:/app/data kortrix-one
```
