// src/app/api/cron/expire/route.ts
//
// EXPIRY STRATEGY: Hybrid — Vercel Cron (scheduled) + Lazy Cleanup
//
// Primary: This endpoint is called by Vercel Cron every 5 minutes.
// Configure in vercel.json:
//   { "crons": [{ "path": "/api/cron/expire", "schedule": "*/5 * * * *" }] }
//
// The endpoint is protected by a shared CRON_SECRET environment variable.
// Vercel automatically passes Authorization: Bearer <CRON_SECRET> for cron invocations.

import { NextRequest, NextResponse } from "next/server";
import { expireStaleReservations } from "@/lib/reservation";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds

export async function GET(request: NextRequest) {
  // Validate cron secret in production
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (authHeader !== expected) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
  }

  try {
    const startedAt = Date.now();
    const expiredCount = await expireStaleReservations();
    const durationMs = Date.now() - startedAt;

    console.log(
      `[CRON] Expired ${expiredCount} reservations in ${durationMs}ms`
    );

    return NextResponse.json({
      success: true,
      expiredCount,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON /api/cron/expire]", error);
    return NextResponse.json(
      { error: "Cron job failed", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
