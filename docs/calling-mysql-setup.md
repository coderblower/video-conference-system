# Calling MySQL Setup

## 1. Create the database

```sql
CREATE DATABASE video_conference CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

If you use a different MySQL user or password, update `config/config.json` and `config/db.js`.

## 2. Install backend dependencies

```bash
npm install
```

## 3. Run migrations

```bash
npm run migrate
```

This creates:

- `call_devices`
- `user_presences`
- `call_histories`

## 4. Start the backend

```bash
npm start
```

Optional environment variables:

```bash
PORT=3001
CALL_RING_TIMEOUT_MS=30000
CLEAR_FIREBASE=false
```

## 5. Logout/login behavior

- Device tokens are stored in MySQL `call_devices`.
- A user stays reachable after login until explicit logout.
- Logout clears the stored push/socket state for that device.
- Firebase is now used only for FCM delivery, not token persistence.

## 6. Re-run migrations later

```bash
npm run migrate
```

To undo the last migration:

```bash
npm run migrate:undo
```
