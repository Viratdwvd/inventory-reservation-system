// src/types/index.ts
import { Decimal } from "@prisma/client/runtime/library";

export interface ProductWithInventory {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: Decimal | string;
  imageUrl: string | null;
  inventory: InventoryWithWarehouse[];
}

export interface InventoryWithWarehouse {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number; // derived: totalStock - reservedStock
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export interface ApiError {
  error: string;
  code: string;
}

export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
