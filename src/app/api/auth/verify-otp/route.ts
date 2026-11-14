import { callAuth, fail, sessionResponse, withAppId } from "@/lib/authApi";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (!email || !otp) return fail("Email and code are required.", 422);

  const result = await callAuth("/verifyOTP", withAppId({ email, otp, remember_me: body?.remember_me === true }));
  if (!result.ok) return result.response;

  const data = result.json?.data;
  if (!data?.token) return fail("Unexpected response from the authentication service.", 502);
  return sessionResponse(data, { deviceToken: data.device_token, deviceExpiresAt: data.device_token_expires_at });
}
