import { NextResponse } from "next/server";
import { callAuth, fail } from "@/lib/authApi";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return fail("Email is required.", 422);

  const result = await callAuth("/sendOTP", { email });
  if (!result.ok) return result.response;
  return NextResponse.json({ message: result.json?.data?.message || "A new code was sent." });
}
