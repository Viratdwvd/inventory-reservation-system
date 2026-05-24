"use client";
// src/components/ReserveButton.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Warehouse {
  id: string;
  name: string;
  location: string;
  availableStock: number;
}

interface Props {
  productId: string;
  productName: string;
  warehouses: Warehouse[];
}

export default function ReserveButton({
  productId,
  productName,
  warehouses,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableWarehouses = warehouses.filter((w) => w.availableStock > 0);
  const selectedWh = warehouses.find((w) => w.id === selectedWarehouse);
  const maxQty = selectedWh?.availableStock ?? 1;

  async function handleReserve() {
    if (!selectedWarehouse) {
      setError("Please select a warehouse");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId: selectedWarehouse, quantity }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reservation failed");
        setLoading(false);
        return;
      }
      setOpen(false);
      router.push(`/reservations/${data.id}`);
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setError(null);
          setSelectedWarehouse(availableWarehouses[0]?.id ?? "");
          setQuantity(1);
        }}
        disabled={availableWarehouses.length === 0}
        className="btn-primary w-full py-2 px-4 rounded-md text-sm"
      >
        {availableWarehouses.length === 0 ? "Out of Stock" : "Reserve"}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl p-6"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-bright)",
            }}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
                  Reserve Item
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {productName}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            {/* Warehouse selection */}
            <div className="mb-4">
              <label
                className="text-xs font-medium mb-2 block"
                style={{ color: "var(--text-secondary)" }}
              >
                WAREHOUSE
              </label>
              <div className="space-y-2">
                {warehouses.map((wh) => (
                  <button
                    key={wh.id}
                    onClick={() => {
                      if (wh.availableStock > 0) {
                        setSelectedWarehouse(wh.id);
                        setQuantity(1);
                      }
                    }}
                    disabled={wh.availableStock === 0}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-colors"
                    style={{
                      background:
                        selectedWarehouse === wh.id
                          ? "var(--amber-glow)"
                          : "var(--bg-surface)",
                      border: `1px solid ${
                        selectedWarehouse === wh.id
                          ? "var(--amber)"
                          : "var(--border)"
                      }`,
                      opacity: wh.availableStock === 0 ? 0.4 : 1,
                      cursor: wh.availableStock === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {wh.name}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {wh.location}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-xs mono font-medium"
                          style={{
                            color:
                              wh.availableStock <= 2
                                ? "#ef4444"
                                : wh.availableStock <= 5
                                ? "#f59e0b"
                                : "var(--green)",
                          }}
                        >
                          {wh.availableStock === 0
                            ? "OUT OF STOCK"
                            : `${wh.availableStock} avail`}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div className="mb-5">
              <label
                className="text-xs font-medium mb-2 block"
                style={{ color: "var(--text-secondary)" }}
              >
                QUANTITY
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  −
                </button>
                <span
                  className="mono text-lg font-medium w-8 text-center"
                  style={{ color: "var(--text-primary)" }}
                >
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                  disabled={quantity >= maxQty}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    color:
                      quantity >= maxQty
                        ? "var(--text-muted)"
                        : "var(--text-primary)",
                  }}
                >
                  +
                </button>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  max {maxQty}
                </span>
              </div>
            </div>

            {error && (
              <div
                className="mb-4 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#ef4444",
                }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2 rounded-md text-sm font-medium"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReserve}
                disabled={loading || !selectedWarehouse}
                className="btn-primary flex-1 py-2 rounded-md text-sm"
              >
                {loading ? "Reserving…" : "Confirm Reserve"}
              </button>
            </div>

            <p className="text-xs text-center mt-3" style={{ color: "var(--text-muted)" }}>
              Reservation holds stock for{" "}
              {process.env.NEXT_PUBLIC_RESERVATION_TTL_MINUTES ?? 10} minutes
            </p>
          </div>
        </div>
      )}
    </>
  );
}
