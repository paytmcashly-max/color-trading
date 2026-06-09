# Realtime Socket Layer

This layer owns Socket.io communication, Redis Pub/Sub fan-out, room management, reconnect sync, and socket-level abuse protection.

## Structure

```text
sockets/
  socket.server.ts
  socket.auth.ts
  socket.events.ts
  redis.adapter.ts
```

## Architecture

```text
Client
  -> Load Balancer
  -> Stateless Node.js servers
  -> Redis Pub/Sub + Socket.io Redis adapter
  -> PostgreSQL source of truth
```

## Authentication

Sockets must provide a JWT access token either in:

```ts
io(url, { auth: { token: accessToken } })
```

or:

```text
Authorization: Bearer <accessToken>
```

The socket auth middleware verifies the JWT and checks that the auth session is still active before joining rooms.

## Rooms

- `user:{userId}`: personal wallet and balance sync events.
- `round:{roundId}`: round timer, lock, bet, result, and completion updates.
- `system`: general system events.

On connect, the socket joins its user room, joins the active round room when one exists, and receives a `system:sync` snapshot.

## Events

Round:
- `round:created`
- `round:timer`
- `round:locked`
- `round:result`
- `round:completed`

User:
- `bet:placed`
- `wallet:update`
- `user:joined`
- `user:balance_sync`

System:
- `system:health`
- `system:sync`
- `system:error`

## Redis

Redis is used in two ways:

- Socket.io Redis adapter: broadcasts room emits across backend instances.
- `realtime:events` Pub/Sub channel: synchronizes domain events between stateless servers.

State cache keys:

```text
current_round
round:{id}:state
user:{id}:wallet_cache
```

## Recovery

- On reconnect, server queries PostgreSQL for current round and wallet snapshot.
- Client can emit `state:sync` to request another snapshot.
- Client can emit `round:join` with a round id to join a specific round room.
- Event envelopes include unique ids, and each process keeps a bounded dedupe set to avoid processing the same Redis event twice.

## Rate Limiting

Each socket has a small in-memory token bucket for client-originated events such as `round:join` and `state:sync`. This protects the server from socket spam while keeping gameplay broadcasts server-driven.
