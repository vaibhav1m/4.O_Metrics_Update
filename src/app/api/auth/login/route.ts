import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DEVICE_COOKIE } from "@/lib/authConfig";
import { callAuth, fail, sessionResponse, withAppId } from "@/lib/authApi";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return fail("Email and password are required.", 422);

  const deviceToken = (await cookies()).get(DEVICE_COOKIE)?.value;
  const result = await callAuth("/login", withAppId({ email, password, ...(deviceToken ? { device_token: deviceToken } : {}) }));
  if (!result.ok) return result.response;

  const data = result.json?.data;
  if (data?.mfa_required) return NextResponse.json({ mfa_required: true, email: data.email || email });
  if (!data?.token) return fail("Unexpected response from the authentication service.", 502);
  return sessionResponse(data);
}
