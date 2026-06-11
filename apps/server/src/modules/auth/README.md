# Auth Module

## Folder Structure

```text
modules/auth/
  controllers/
    auth.controller.ts
  dto/
    auth.dto.ts
    validators/
      auth.validators.ts
  services/
    auth.service.ts
    password.service.ts
  auth.routes.ts
```

## Endpoints

### POST /api/v1/auth/register

Request:

```json
{
  "email": "player@example.com",
  "password": "StrongPass1!",
  "displayName": "Player One"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "player@example.com",
    "displayName": "Player One",
    "status": "ACTIVE",
    "role": "USER",
    "createdAt": "2026-06-09T00:00:00.000Z",
    "updatedAt": "2026-06-09T00:00:00.000Z"
  },
  "tokens": {
    "accessToken": "jwt",
    "tokenType": "Bearer",
    "expiresInSeconds": 900
  }
}
```

The refresh token is not returned in JSON. It is set as an httpOnly cookie
scoped to `/api/v1/auth`.

### POST /api/v1/auth/login

Request:

```json
{
  "email": "player@example.com",
  "password": "StrongPass1!"
}
```

Response shape matches register.

### POST /api/v1/auth/refresh

No request body is required. The server reads the refresh cookie, rotates it,
sets a replacement cookie, and returns a new access token.

### POST /api/v1/auth/logout

Headers:

```text
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "success": true
}
```

### POST /api/v1/auth/logout-all

Revokes every active session for the current user and clears the refresh cookie.

### GET /api/v1/auth/me

Headers:

```text
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "player@example.com",
    "displayName": "Player One",
    "status": "ACTIVE",
    "role": "USER",
    "createdAt": "2026-06-09T00:00:00.000Z",
    "updatedAt": "2026-06-09T00:00:00.000Z"
  }
}
```

## Admin Endpoint

`GET /api/v1/admin/users` requires an access token for a user with `ADMIN` role.

## Security Notes

- Passwords are hashed with bcrypt using 12 salt rounds.
- JWT secrets are required from environment variables and are never hardcoded.
- Access tokens are short-lived and kept in browser memory only.
- Refresh tokens are delivered only through httpOnly cookies and stored server-side only as SHA-256 hashes in `auth_sessions`.
- Refresh rotation revokes every active session when the presented token hash mismatches, the session is already revoked/expired, a cryptographically valid expired JWT is reused, the signed token references a missing rotated session, or concurrent reuse wins the rotation race.
- A changed user-agent alone does not revoke sessions. It emits the sanitized `AUTH_REFRESH_USER_AGENT_CHANGED` warning with short user-agent fingerprints for future risk/step-up handling.
- Production refresh cookies use `Secure` and `SameSite=None`; refresh, logout, and logout-all also require a trusted `Origin`.
- Logout revokes the current auth session. The auth guard verifies both JWT validity and active session state.
- Register and login are protected by IP-based rate limiting.
- Registration keeps its fast email pre-check, but the database unique constraint remains authoritative. Concurrent duplicate attempts return the same generic `409 REGISTRATION_UNAVAILABLE` response, while user, wallet, and initial ledger creation remain one transaction.
- Zod validates email format and password strength before service logic runs.
