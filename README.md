# StockReserve — Race-Condition-Safe Inventory Reservation System

A full-stack inventory reservation platform built with Next.js 14 (App Router), TypeScript, Prisma, and PostgreSQL. Designed to prevent overselling under concurrent load while avoiding stock lock-up from abandoned carts.

**Live Demo:** [stockreserve.vercel.app](https://inventory-reservation-system-topaz-five.vercel.app/)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Concurrency Strategy](#concurrency-strategy)
- [Reservation Expiry Strategy](#reservation-expiry-strategy)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Database: Migrations and Seeding](#database-migrations-and-seeding)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Tradeoffs and Future Improvements](#tradeoffs-and-future-improvements)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js 14 (App Router, Vercel)                                     │
│                                                                       │
│  Server Components        Client Components                           │
│  ├── /                    ├── ReserveButton.tsx  (modal + form)       │
│  └── /reservations/[id]   └── ReservationClient.tsx (countdown timer) │
│                                                                       │
│  Route Handlers (API)                                                 │
│  ├── GET  /api/products                                               │
│  ├── GET  /api/warehouses                                             │
│  ├── POST /api/reservations           ← concurrency-critical          │
│  ├── GET  /api/reservations/:id                                       │
│  ├── POST /api/reservations/:id/confirm                               │
│  ├── POST /api/reservations/:id/release                               │
│  └── GET  /api/cron/expire            ← called by Vercel Cron        │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
         ┌──────────────┼───────────────┐
         ▼              ▼               ▼
   ┌──────────┐  ┌────────────┐  ┌──────────────────┐
   │ Prisma   │  │ PostgreSQL │  │ Upstash Redis     │
   │ ORM      │  │ (Neon)     │  │ (idempotency cache│
   └──────────┘  └────────────┘  │  — optional)      │
                                 └──────────────────────┘
```

### Data Model

```
Product          Warehouse
   │                 │
   └────────┬────────┘
            ▼
        Inventory
        ┌─────────────────────┐
        │ totalStock          │
        │ reservedStock       │
        │ ─────────────────── │
        │ availableStock =    │
        │   total - reserved  │
        └─────────────────────┘
            │
            ▼
        Reservation
        ┌─────────────────────┐
        │ status: PENDING     │
        │         CONFIRMED   │
        │         RELEASED    │
        │         EXPIRED     │
        │ expiresAt           │
        │ idempotencyKey      │
        └─────────────────────┘
```

---

## Concurrency Strategy

> **This is the most important part of the system.**

### The Problem

Without proper locking, two simultaneous reservation requests for the final unit of stock will both read `availableStock = 1`, both proceed, and result in `reservedStock = 2` against a `totalStock = 1` — **overselling**.

This is a classic TOCTOU (Time-of-Check to Time-of-Use) race condition.

### The Solution: PostgreSQL `SELECT ... FOR UPDATE`

All reservation creation logic runs inside a single database transaction in `src/lib/reservation.ts`. The key step is locking the specific `Inventory` row before reading its stock:

```sql
SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
FROM "Inventory"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

**How it serialises concurrent requests:**

```
T1: BEGIN
T1: SELECT ... FOR UPDATE  →  acquires row lock ✓
T2: BEGIN
T2: SELECT ... FOR UPDATE  →  BLOCKS (waiting for T1's lock)

T1: availableStock = 1 >= 1  →  condition satisfied
T1: UPDATE reservedStock += 1
T1: INSERT INTO Reservation (PENDING)
T1: COMMIT  →  releases lock

T2: gets lock, reads reservedStock = 1
T2: availableStock = 1 - 1 = 0 < 1  →  INSUFFICIENT_STOCK
T2: ROLLBACK

Result: exactly one reservation created. No overselling. ✓
```

**Why not a serializable isolation level?**  
Serializable transactions detect conflicts but retry automatically, which can mask failures. `SELECT FOR UPDATE` with READ COMMITTED is more explicit: the lock is acquired deterministically and the conflict is surfaced immediately as a `409 Conflict`.

**Why not Redis distributed locks?**  
Redis locks add a second failure domain. If Redis is unavailable, reservations would fail even when the database is healthy. Since the serialisation needed is _per inventory row_, PostgreSQL's built-in row locking is the correct and sufficient primitive. Redis is used in this project only for the stateless idempotency cache (a bonus feature), where unavailability is gracefully degraded.

---

## Reservation Expiry Strategy

### Hybrid Approach: Vercel Cron + Lazy Stock Check

**Primary (scheduled):** A Vercel Cron job hits `GET /api/cron/expire` every 5 minutes. This job finds all `PENDING` reservations where `expiresAt < NOW()`, atomically decrements their `reservedStock` from the `Inventory` table, and marks them `EXPIRED`.

```
vercel.json:  "*/5 * * * *"  →  /api/cron/expire
```

**Why not a background thread or `setInterval`?**  
Next.js on Vercel is serverless — there is no persistent process between requests. Vercel Cron is the idiomatic scheduled execution primitive for this environment.

**Why not lazy-only (on read)?**  
A lazy-only strategy defers cleanup until the next reservation attempt on the same product+warehouse. This means `reservedStock` can remain inflated for up to TTL minutes, making available stock appear lower than it actually is, which can cause false `409`s. The cron job bounds this window to 5 minutes.

**Expiry window:** Configurable via `RESERVATION_TTL_MINUTES` (default: 10 minutes).

---

## Local Setup

### Prerequisites

- Node.js 18+
- A PostgreSQL instance (Neon free tier recommended for local dev)
- Optional: Upstash Redis for idempotency caching

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/inventory-reservation-system
cd inventory-reservation-system

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in your DATABASE_URL, DIRECT_URL, etc.

# 4. Push schema to database
npm run db:push

# 5. Seed with sample data
npm run db:seed

# 6. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (with PgBouncer pooling for Neon) |
| `DIRECT_URL` | ✅ | Direct PostgreSQL URL (used by Prisma Migrate, bypasses PgBouncer) |
| `UPSTASH_REDIS_REST_URL` | ❌ | Upstash Redis URL for idempotency caching (optional) |
| `UPSTASH_REDIS_REST_TOKEN` | ❌ | Upstash Redis auth token (optional) |
| `RESERVATION_TTL_MINUTES` | ❌ | Reservation hold window in minutes (default: 10) |
| `CRON_SECRET` | ✅ prod | Secret protecting the cron endpoint (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_RESERVATION_TTL_MINUTES` | ❌ | TTL exposed to browser for UI display |

---

## Database: Migrations and Seeding

```bash
# Initial schema push (development — no migration history)
npm run db:push

# Formal migration (creates migration history, use for staging/prod)
npm run db:migrate

# Seed with warehouses, products, and inventory
# Includes intentional scarcity (1-unit stock) for concurrency testing
npm run db:seed

# Open Prisma Studio (visual DB browser)
npm run db:studio

# Full reset (drops all data and re-migrates)
npm run db:reset
```

### Seeded Data

- **3 Warehouses:** Mumbai Central, Delhi North Hub, Bangalore Tech Park
- **5 Products:** Sony WH-1000XM5, AirPods Pro 2nd Gen, Galaxy Tab S9, Logitech MX Master 3S, SteelSeries Apex Pro
- **Bangalore Tech Park** has 1-unit stock on 2 products — ideal for race condition testing

---

## API Reference

### `GET /api/products`

Returns all products with warehouse-wise inventory.

```json
[
  {
    "id": "clxxx",
    "name": "Sony WH-1000XM5",
    "sku": "SNY-WH1000XM5",
    "price": "24999.00",
    "inventory": [
      {
        "warehouseId": "clyyy",
        "totalStock": 15,
        "reservedStock": 2,
        "availableStock": 13,
        "warehouse": { "name": "Mumbai Central", "location": "Mumbai, MH" }
      }
    ]
  }
]
```

---

### `GET /api/warehouses`

Returns all warehouses.

---

### `POST /api/reservations`

Creates a temporary reservation. **Concurrency-safe via `SELECT FOR UPDATE`.**

**Request:**
```json
{ "productId": "clxxx", "warehouseId": "clyyy", "quantity": 1 }
```

**Headers (optional):**
```
Idempotency-Key: <uuid>
```

**Responses:**
- `201 Created` — reservation created
- `400 Bad Request` — validation error
- `404 Not Found` — inventory record not found
- `409 Conflict` — insufficient stock

---

### `GET /api/reservations/:id`

Returns a single reservation with product and warehouse details.

---

### `POST /api/reservations/:id/confirm`

Confirms a reservation. Permanently deducts stock (`totalStock -= quantity`, `reservedStock -= quantity`).

**Responses:**
- `200 OK` — confirmed
- `409 Conflict` — not in PENDING state
- `410 Gone` — reservation has expired

---

### `POST /api/reservations/:id/release`

Releases a reservation early. Returns stock to available pool (`reservedStock -= quantity`).

---

### `GET /api/cron/expire`

Expires all stale PENDING reservations. Protected by `Authorization: Bearer <CRON_SECRET>` in production.

---

## Deployment

### Vercel + Neon + Upstash

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard, then:
vercel env add DATABASE_URL
vercel env add DIRECT_URL
# ... etc

# Run migrations against production DB
DATABASE_URL="your-prod-direct-url" npx prisma migrate deploy

# Seed production (once)
DATABASE_URL="your-prod-direct-url" npm run db:seed
```

**Vercel Cron** is automatically configured via `vercel.json` — the `*/5 * * * *` schedule will expire stale reservations every 5 minutes at no extra cost on Hobby/Pro plans.

---

## Tradeoffs and Future Improvements

### Current Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| `SELECT FOR UPDATE` over serializable transactions | More explicit, lower retry complexity, but requires all writers to go through the same transaction pattern |
| Denormalized `reservedStock` on `Inventory` | Fast available-stock reads without aggregating reservations, but requires careful bookkeeping on every state change |
| Lazy Redis (idempotency) | Redis unavailability is non-fatal, but idempotency protection degrades silently |
| Vercel Cron every 5min | Simple and serverless-native, but means expired stock may appear reserved for up to 5 minutes |

### Future Improvements

- **Webhook / SSE for real-time stock updates** — currently the product page requires a refresh to see updated stock after reservations expire or are confirmed. Server-Sent Events would push updates to all connected clients.
- **Optimistic UI with SWR** — polling `/api/products` every 30s would make stock counts feel live without full real-time infrastructure.
- **Audit log table** — append-only log of every reservation state transition for compliance and debugging.
- **Per-user reservation limits** — prevent a single user from holding all available stock.
- **Partial quantity reservation** — if 3 units are requested but only 2 are available, reserve 2 and notify rather than rejecting entirely.
- **Multi-warehouse fulfillment** — if one warehouse has insufficient stock, split the reservation across warehouses automatically.
- **Prometheus metrics** — expose `reservation_created_total`, `reservation_409_total`, `expiry_run_duration_ms` for observability.
