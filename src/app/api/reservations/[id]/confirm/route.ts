// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { confirmReservation, ReservationError } from "@/lib/reservation";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const idempotencyKey =
      request.headers.get("Idempotency-Key") ?? undefined;

    const reservation = await confirmReservation(params.id, idempotencyKey);

    return NextResponse.json({
      ...reservation,
      product: {
        ...reservation.product,
        price: reservation.product.price.toString(),
      },
    });
  } catch (error) {
    if (error instanceof ReservationError) {
      const messages: Record<string, string> = {
        RESERVATION_NOT_FOUND: "Reservation not found",
        RESERVATION_EXPIRED: "This reservation has expired and can no longer be confirmed",
        ALREADY_CONFIRMED: "This reservation has already been confirmed",
        RESERVATION_NOT_PENDING: "Only PENDING reservations can be confirmed",
        INVENTORY_NOT_FOUND: "Inventory record not found",
      };

      return NextResponse.json(
        {
          error: messages[error.code] ?? error.code,
          code: error.code,
        },
        { status: error.statusCode }
      );
    }

    console.error("[POST /api/reservations/:id/confirm]", error);
    return NextResponse.json(
      { error: "Failed to confirm reservation", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
