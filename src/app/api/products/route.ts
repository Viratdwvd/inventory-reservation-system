// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        inventory: {
          include: {
            warehouse: {
              select: { id: true, name: true, location: true },
            },
          },
          orderBy: { warehouse: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });

    // Derive availableStock = totalStock - reservedStock for each row
    const payload = products.map((product) => ({
      ...product,
      price: product.price.toString(),
      inventory: product.inventory.map((inv) => ({
        ...inv,
        availableStock: inv.totalStock - inv.reservedStock,
      })),
    }));

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json(
      { error: "Failed to fetch products", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
