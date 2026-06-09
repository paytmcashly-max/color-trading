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

### POST /auth/register

Request:

```json
{
  "email": "player@example.com",
  "password": "StrongPass123!",
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
    "refreshToken": "jwt",
    "tokenType": "Bearer",
    "expiresInSeconds": 900
  }
}
```

### POST /auth/login

Request:

```json
{
  "email": "player@example.com",
  "password": "StrongPass123!"
}
```

Response shape matches register.

### POST /auth/logout

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

### GET /auth/me

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

`GET /admin/users` requires an access token for a user with `ADMIN` role.

## Security Notes

- Passwords are hashed with bcrypt using 12 salt rounds.
- JWT secrets are required from environment variables and are never hardcoded.
- Access tokens are short-lived; refresh tokens are stored only as SHA-256 hashes in `auth_sessions`.
- Logout revokes the current auth session. The auth guard verifies both JWT validity and active session state.
- Register and login are protected by IP-based rate limiting.
- Zod validates email format and password strength before service logic runs.
