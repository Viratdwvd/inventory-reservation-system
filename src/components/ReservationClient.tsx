"use client";
// src/components/ReservationClient.tsx
// Client component for the checkout/reservation page.
// Handles: live countdown timer, confirm, cancel, error display.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Status = "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";

interface Reservation {
  id: string;
  quantity: number;
  status: Status;
  expiresAt: string;
  createdAt: string;
  product: { id: string; name: string; sku: string; price: string };
  warehouse: { id: string; name: string; location: string };
}

interface Props {
  reservation: Reservation;
}

function useCountdown(expiresAt: string, status: Status) {
  const [msLeft, setMsLeft] = useState(
    () => new Date(expiresAt).getTime() - Date.now()
  );

  useEffect(() => {
    if (status !== "PENDING") return;
    const interval = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      setMsLeft(diff);
      if (diff <= 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isUrgent = totalSeconds <= 60;
  const isExpired = totalSeconds === 0;

  return { minutes, seconds, isUrgent, isExpired, totalSeconds };
}

const STATUS_CONFIG: Record<
  Status,
  { label: string; color: string; bg: string; border: string }
> = {
  PENDING: {
    label: "PENDING",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.3)",
  },
  CONFIRMED: {
    label: "CONFIRMED",
    color: "#10b981",
    bg: "rgba(16,185,129,0.1)",
    border: "rgba(16,185,129,0.3)",
  },
  RELEASED: {
    label: "RELEASED",
    color: "#60a5fa",
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.3)",
  },
  EXPIRED: {
    label: "EXPIRED",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.3)",
  },
};

export default function ReservationClient({ reservation: initial }: Props) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initial);
  const [loading, setLoading] = useState<"confirm" | "release" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { minutes, seconds, isUrgent, isExpired } = useCountdown(
    reservation.expiresAt,
    reservation.status
  );

  // Auto-mark as expired when countdown reaches 0
  useEffect(() => {
    if (isExpired && reservation.status === "PENDING") {
      setReservation((r) => ({ ...r, status: "EXPIRED" }));
    }
  }, [isExpired, reservation.status]);

  const handleConfirm = useCallback(async () => {
    setLoading("confirm");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setReservation((r) => ({ ...r, status: "EXPIRED" }));
          setError("Your reservation has expired. Please start a new one.");
        } else {
          setError(data.error ?? "Failed to confirm reservation");
        }
        return;
      }

      setReservation((r) => ({ ...r, status: "CONFIRMED" }));
      setSuccessMsg("🎉 Purchase confirmed! Your order is being processed.");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const handleRelease = useCallback(async () => {
    setLoading("release");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to cancel reservation");
        return;
      }

      setReservation((r) => ({ ...r, status: "RELEASED" }));
      setSuccessMsg("Reservation cancelled. Stock has been returned.");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const statusCfg = STATUS_CONFIG[reservation.status];
  const isPending = reservation.status === "PENDING";

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Back link */}
      <a
        href="/"
        className="flex items-center gap-1.5 text-xs mb-6 transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        ← Back to products
      </a>

      {/* Status card */}
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{
          background: "var(--bg-surface)",
          border: `1px solid ${statusCfg.border}`,
        }}
      >
        {/* Status header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: statusCfg.bg, borderBottom: `1px solid ${statusCfg.border}` }}
        >
          <span
            className="mono text-xs font-semibold tracking-widest"
            style={{ color: statusCfg.color }}
          >
            {statusCfg.label}
          </span>
          <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
            #{reservation.id.slice(-8).toUpperCase()}
          </span>
        </div>

        <div className="p-6">
          {/* Product info */}
          <h1
            className="font-semibold text-lg mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {reservation.product.name}
          </h1>
          <div className="mono text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            {reservation.product.sku}
          </div>

          {/* Details grid */}
          <div
            className="rounded-xl p-4 mb-5 grid grid-cols-2 gap-4"
            style={{ background: "var(--bg-base)" }}
          >
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                WAREHOUSE
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {reservation.warehouse.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {reservation.warehouse.location}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                QTY · TOTAL
              </div>
              <div
                className="text-sm font-semibold mono"
                style={{ color: "var(--amber)" }}
              >
                {reservation.quantity} ×{" "}
                ₹{Number(reservation.product.price).toLocaleString("en-IN")}
              </div>
              <div
                className="text-xs font-semibold mono"
                style={{ color: "var(--text-primary)" }}
              >
                ₹
                {(
                  reservation.quantity * Number(reservation.product.price)
                ).toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                RESERVED AT
              </div>
              <div className="text-xs mono" style={{ color: "var(--text-secondary)" }}>
                {new Date(reservation.createdAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                EXPIRES AT
              </div>
              <div className="text-xs mono" style={{ color: "var(--text-secondary)" }}>
                {new Date(reservation.expiresAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
          </div>

          {/* Countdown timer */}
          {isPending && (
            <div
              className="rounded-xl p-4 mb-5 text-center"
              style={{
                background: isUrgent
                  ? "rgba(239,68,68,0.08)"
                  : "var(--amber-glow)",
                border: `1px solid ${
                  isUrgent ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"
                }`,
              }}
            >
              <div
                className="text-xs font-medium uppercase tracking-wider mb-2"
                style={{
                  color: isUrgent ? "#ef4444" : "var(--amber)",
                }}
              >
                {isUrgent ? "⚠ Expiring Soon" : "Reserved For"}
              </div>
              <div
                className={`mono text-4xl font-bold tabular-nums ${
                  isUrgent ? "countdown-urgent" : ""
                }`}
                style={{ color: isUrgent ? "#ef4444" : "var(--amber)" }}
              >
                {String(minutes).padStart(2, "0")}:
                {String(seconds).padStart(2, "0")}
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                {isUrgent
                  ? "Complete your purchase before time runs out"
                  : "Complete your purchase to confirm"}
              </div>
            </div>
          )}

          {/* Terminal states */}
          {reservation.status === "CONFIRMED" && (
            <div
              className="rounded-xl p-4 mb-5 text-center"
              style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.3)",
              }}
            >
              <div className="text-2xl mb-1">✓</div>
              <div
                className="font-semibold text-sm"
                style={{ color: "#10b981" }}
              >
                Purchase Confirmed
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Your order is being processed
              </div>
            </div>
          )}

          {reservation.status === "RELEASED" && (
            <div
              className="rounded-xl p-4 mb-5 text-center"
              style={{
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              <div className="font-semibold text-sm" style={{ color: "#60a5fa" }}>
                Reservation Cancelled
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Stock has been returned to inventory
              </div>
            </div>
          )}

          {reservation.status === "EXPIRED" && (
            <div
              className="rounded-xl p-4 mb-5 text-center"
              style={{
                background: "rgba(107,114,128,0.08)",
                border: "1px solid rgba(107,114,128,0.3)",
              }}
            >
              <div className="font-semibold text-sm" style={{ color: "#6b7280" }}>
                Reservation Expired
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                The hold window has passed
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="rounded-lg px-4 py-2.5 mb-4 text-sm"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {/* Success */}
          {successMsg && !error && (
            <div
              className="rounded-lg px-4 py-2.5 mb-4 text-sm"
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#10b981",
              }}
            >
              {successMsg}
            </div>
          )}

          {/* Action buttons */}
          {isPending && (
            <div className="flex gap-2">
              <button
                onClick={handleRelease}
                disabled={!!loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading === "release" ? "Cancelling…" : "Cancel"}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!!loading}
                className="btn-primary flex-2 flex-1 py-2.5 rounded-xl text-sm"
                style={{ minWidth: 0 }}
              >
                {loading === "confirm" ? "Processing…" : "Confirm Purchase"}
              </button>
            </div>
          )}

          {(reservation.status === "EXPIRED" ||
            reservation.status === "RELEASED") && (
            <a
              href="/"
              className="btn-primary block text-center py-2.5 rounded-xl text-sm"
            >
              Browse Products
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
