// src/app/reservations/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ReservationClient from "@/components/ReservationClient";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props) {
  return {
    title: `Reservation ${params.id.slice(-8).toUpperCase()} · StockReserve`,
  };
}

export default async function ReservationPage({ params }: Props) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: {
      product: {
        select: { id: true, name: true, sku: true, price: true },
      },
      warehouse: {
        select: { id: true, name: true, location: true },
      },
    },
  });

  if (!reservation) notFound();

  // Serialize Decimal for client component
  const serialized = {
    ...reservation,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
    product: {
      ...reservation.product,
      price: reservation.product.price.toString(),
    },
  };

  return (
    <div
      className="grid-bg min-h-full"
      style={{ background: "var(--bg-base)" }}
    >
      <ReservationClient reservation={serialized} />
    </div>
  );
}
