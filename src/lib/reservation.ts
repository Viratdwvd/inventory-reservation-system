// src/lib/reservation.ts
// ─── Reservation core — Virat Dwivedi ─────────────────────────────────────────
//
// The central problem: two checkout requests arriving simultaneously for the
// last unit of a SKU. Without locking, both reads see stock = 1, both proceed,
// and we oversell.
//
// My approach: wrap the check-and-increment inside a single Postgres transaction
// and acquire a row-level lock with SELECT ... FOR UPDATE before reading stock.
// This forces concurrent transactions to serialise at the database level — the
// second request blocks until the first commits, then reads the updated
// reservedStock and correctly returns 409.
//
// I chose row-level locking over:
//   - Serializable isolation: correct but heavier; retries hide the failure
//   - Redis distributed locks: adds a second failure domain unnecessarily
//   - Optimistic concurrency: requires retry logic on the client

import { prisma } from "./prisma";
import { getIdempotencyCache, setIdempotencyCache } from "./redis";
import { Reservation, ReservationStatus } from "@prisma/client";

// Configurable reservation window — 10 minutes by default
export const RESERVATION_TTL_MS =
  Number(process.env.RESERVATION_TTL_MINUTES ?? 10) * 60 * 1000;

// Raw inventory row returned by $queryRaw
interface RawInventory {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
}

import type { Decimal } from "@prisma/client/runtime/library";

export type ReservationWithRelations = Reservation & {
  product: { id: string; name: string; sku: string; price: string | Decimal };
  warehouse: { id: string; name: string; location: string };
};

// ─────────────────────────────────────────────────────────────────────────────
// createReservation
// ─────────────────────────────────────────────────────────────────────────────
export async function createReservation(
  productId: string,
  warehouseId: string,
  quantity: number,
  idempotencyKey?: string
): Promise<ReservationWithRelations> {
  // ── Idempotency check (Redis, best-effort) ──────────────────────────────
  if (idempotencyKey) {
    const cached = await getIdempotencyCache(`idem:reserve:${idempotencyKey}`);
    if (cached) {
      return JSON.parse(cached) as ReservationWithRelations;
    }
  }

  // ── Atomic transaction with row-level lock ──────────────────────────────
  const reservation = await prisma.$transaction(
    async (tx) => {
      // Step 1: Lock the specific Inventory row.
      // Concurrent transactions attempting this same row will BLOCK here
      // until the current transaction commits or rolls back.
      const rows = await tx.$queryRaw<RawInventory[]>`
        SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
        FROM "Inventory"
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw new ReservationError("INVENTORY_NOT_FOUND", 404);
      }

      const inv = rows[0];

      // Step 2: Check available stock INSIDE the lock.
      // At this point no other transaction can modify this row.
      const availableStock = inv.totalStock - inv.reservedStock;
      if (availableStock < quantity) {
        throw new ReservationError("INSUFFICIENT_STOCK", 409);
      }

      // Step 3: Atomically increment reservedStock.
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedStock" = "reservedStock" + ${quantity},
            "updatedAt" = NOW()
        WHERE id = ${inv.id}
      `;

      // Step 4: Create the reservation record.
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const created = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: ReservationStatus.PENDING,
          expiresAt,
          idempotencyKey: idempotencyKey ?? null,
        },
        include: {
          product: { select: { id: true, name: true, sku: true, price: true } },
          warehouse: { select: { id: true, name: true, location: true } },
        },
      });

      return created;
    },
    { timeout: 10_000 } // 10s transaction timeout
  );

  // ── Cache idempotency response ──────────────────────────────────────────
  if (idempotencyKey) {
    await setIdempotencyCache(
      `idem:reserve:${idempotencyKey}`,
      JSON.stringify(reservation)
    );
  }

  return reservation as ReservationWithRelations;
}

// ─────────────────────────────────────────────────────────────────────────────
// confirmReservation
// Finalizes a reservation: deducts from totalStock, clears reservedStock.
// Net effect: availableStock = totalStock - 1 (permanently sold).
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmReservation(
  reservationId: string,
  idempotencyKey?: string
): Promise<ReservationWithRelations> {
  if (idempotencyKey) {
    const cached = await getIdempotencyCache(`idem:confirm:${idempotencyKey}`);
    if (cached) return JSON.parse(cached) as ReservationWithRelations;
  }

  const result = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) throw new ReservationError("RESERVATION_NOT_FOUND", 404);
    if (reservation.status === ReservationStatus.CONFIRMED)
      throw new ReservationError("ALREADY_CONFIRMED", 409);
    if (reservation.status !== ReservationStatus.PENDING)
      throw new ReservationError("RESERVATION_NOT_PENDING", 409);
    if (new Date() > reservation.expiresAt)
      throw new ReservationError("RESERVATION_EXPIRED", 410);

    // Lock inventory row for the final stock deduction
    const rows = await tx.$queryRaw<RawInventory[]>`
      SELECT id, "totalStock", "reservedStock"
      FROM "Inventory"
      WHERE "productId" = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
      FOR UPDATE
    `;

    if (rows.length === 0) throw new ReservationError("INVENTORY_NOT_FOUND", 404);
    const inv = rows[0];

    // Deduct from totalStock (item sold) AND release from reservedStock
    await tx.$executeRaw`
      UPDATE "Inventory"
      SET "totalStock"    = "totalStock"    - ${reservation.quantity},
          "reservedStock" = "reservedStock" - ${reservation.quantity},
          "updatedAt"     = NOW()
      WHERE id = ${inv.id}
    `;

    return await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CONFIRMED },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });
  });

  if (idempotencyKey) {
    await setIdempotencyCache(
      `idem:confirm:${idempotencyKey}`,
      JSON.stringify(result)
    );
  }

  return result as ReservationWithRelations;
}

// ─────────────────────────────────────────────────────────────────────────────
// releaseReservation
// Returns reserved stock to available pool.
// ─────────────────────────────────────────────────────────────────────────────
export async function releaseReservation(
  reservationId: string
): Promise<ReservationWithRelations> {
  return await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) throw new ReservationError("RESERVATION_NOT_FOUND", 404);
    if (reservation.status !== ReservationStatus.PENDING)
      throw new ReservationError("RESERVATION_NOT_PENDING", 409);

    await tx.$executeRaw`
      UPDATE "Inventory"
      SET "reservedStock" = GREATEST(0, "reservedStock" - ${reservation.quantity}),
          "updatedAt"     = NOW()
      WHERE "productId" = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
    `;

    return await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.RELEASED },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });
  }) as ReservationWithRelations;
}

// ─────────────────────────────────────────────────────────────────────────────
// expireStaleReservations
// Called by cron job. Finds all PENDING reservations past their expiresAt,
// marks them EXPIRED, and releases their reserved stock.
// Returns count of expired reservations.
// ─────────────────────────────────────────────────────────────────────────────
export async function expireStaleReservations(): Promise<number> {
  const now = new Date();

  // Find all expired PENDING reservations
  const expired = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.PENDING,
      expiresAt: { lt: now },
    },
    select: { id: true, productId: true, warehouseId: true, quantity: true },
  });

  if (expired.length === 0) return 0;

  // Process in a transaction — release stock and mark expired
  await prisma.$transaction(async (tx) => {
    for (const res of expired) {
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedStock" = GREATEST(0, "reservedStock" - ${res.quantity}),
            "updatedAt"     = NOW()
        WHERE "productId" = ${res.productId}
          AND "warehouseId" = ${res.warehouseId}
      `;
    }

    await tx.reservation.updateMany({
      where: { id: { in: expired.map((r) => r.id) } },
      data: { status: ReservationStatus.EXPIRED },
    });
  });

  return expired.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error class
// ─────────────────────────────────────────────────────────────────────────────
export class ReservationError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(code);
    this.name = "ReservationError";
  }
}
