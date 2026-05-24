// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { releaseReservation, ReservationError } from "@/lib/reservation";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await releaseReservation(params.id);

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
        RESERVATION_NOT_PENDING: "Only PENDING reservations can be released",
      };

      return NextResponse.json(
        {
          error: messages[error.code] ?? error.code,
          code: error.code,
        },
        { status: error.statusCode }
      );
    }

    console.error("[POST /api/reservations/:id/release]", error);
    return NextResponse.json(
      { error: "Failed to release reservation", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
