// src/app/api/reservations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found", code: "RESERVATION_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...reservation,
      product: {
        ...reservation.product,
        price: reservation.product.price.toString(),
      },
    });
  } catch (error) {
    console.error("[GET /api/reservations/:id]", error);
    return NextResponse.json(
      { error: "Failed to fetch reservation", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
