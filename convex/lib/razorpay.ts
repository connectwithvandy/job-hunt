// Razorpay's checks, in plain Web Crypto so they run in Convex's default runtime.

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC-SHA256 of `message` with `secret`, as lowercase hex: how Razorpay signs payments and webhooks. */
export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** Compares two strings without leaking, through timing, how much of them matched. */
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Whether the checkout's success reply is genuine: Razorpay signs "order_id|payment_id" with your key secret. */
export async function paymentGenuine(secret: string, orderId: string, paymentId: string, signature: string) {
  return sameText(await hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** Whether a webhook call is genuine: Razorpay signs the raw body with the webhook secret. */
export async function webhookGenuine(secret: string, body: string, signature: string) {
  return sameText(await hmacHex(secret, body), signature);
}
