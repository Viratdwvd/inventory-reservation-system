// src/app/api/reservations/route.ts
//
// POST /api/reservations
//
// This is the most critical endpoint in the system.
// Concurrency is handled in src/lib/reservation.ts via SELECT ... FOR UPDATE.
//
// Supports optional Idempotency-Key header for safe retries.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createReservation, ReservationError } from "@/lib/reservation";

export const dynamic = "force-dynamic";

const CreateReservationSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z.number().int().positive("quantity must be a positive integer"),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate body
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Extract optional idempotency key
    const idempotencyKey =
      request.headers.get("Idempotency-Key") ?? undefined;

    const { productId, warehouseId, quantity } = parsed.data;

    const reservation = await createReservation(
      productId,
      warehouseId,
      quantity,
      idempotencyKey
    );

    return NextResponse.json(
      {
        ...reservation,
        product: {
          ...reservation.product,
          price: reservation.product.price.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ReservationError) {
      const messages: Record<string, string> = {
        INSUFFICIENT_STOCK: "Not enough stock available for this reservation",
        INVENTORY_NOT_FOUND: "No inventory record found for this product/warehouse combination",
      };

      return NextResponse.json(
        {
          error: messages[error.code] ?? error.code,
          code: error.code,
        },
        { status: error.statusCode }
      );
    }

    console.error("[POST /api/reservations]", error);
    return NextResponse.json(
      { error: "Failed to create reservation", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// GET /api/reservations — list all reservations (for admin/debug)
export async function GET(request: NextRequest) {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const reservations = await prisma.reservation.findMany({
      where: status ? { status: status as never } : undefined,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(reservations);
  } catch (error) {
    console.error("[GET /api/reservations]", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
