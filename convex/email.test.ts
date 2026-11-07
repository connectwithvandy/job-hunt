import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EMAIL_RETRY_WAITS, resetEmail, sendEmail, welcomeEmail } from "./lib/email";

test("welcome email uses their first name and the role they asked for", () => {
  const m = welcomeEmail({ name: "Priya Sharma", role: "Account Executive", email: "priya@example.com" });
  expect(m.subject).toBe("Priya, you're in on JobPipe");
  expect(m.text).toContain("I'm Vandy, and I built JobPipe.");
  expect(m.text).toContain("Hi Priya,");
  expect(m.text).toContain('Add "Account Executive" as your first role');
  expect(m.text).toContain("/?signin=1&email=priya%40example.com");
});

test("welcome email capitalises a name typed in lower case", () => {
  expect(welcomeEmail({ name: "vandy", email: "a@example.com" }).subject).toBe("Vandy, you're in on JobPipe");
});

test("welcome email still reads well with no name or role", () => {
  const m = welcomeEmail({ email: "a@example.com" });
  expect(m.subject).toBe("You're in on JobPipe");
  expect(m.text).toContain("Hi,");
  expect(m.text).not.toContain("undefined");
});

test("welcome email escapes what people typed", () => {
  expect(welcomeEmail({ name: "<b>x</b>", email: "a@example.com" }).html).not.toContain("<b>x</b>");
});

test("reset email carries the code", () => {
  expect(resetEmail("12345678").text).toContain("12345678");
});

describe("sendEmail tries again only when it could help", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test";
    EMAIL_RETRY_WAITS.splice(0, 2, 1, 1);
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.unstubAllGlobals();
  });
  const msg = { to: "a@example.com", subject: "s", text: "t" };
  const replies = (...list: (number | Error)[]) => {
    const f = vi.fn(async () => {
      const r = list.shift()!;
      if (r instanceof Error) throw r;
      return new Response("x", { status: r });
    });
    vi.stubGlobal("fetch", f);
    return f;
  };
  const keyOf = (f: ReturnType<typeof replies>, call: number) => ((f.mock.calls[call] as unknown as [string, { headers: Record<string, string> }])[1]).headers["Idempotency-Key"];

  test("a busy moment and a lost connection are tried again, with the same key", async () => {
    const f = replies(429, new Error("network"), 200);
    await sendEmail(msg);
    expect(f).toHaveBeenCalledTimes(3);
    expect(keyOf(f, 0)).toBe(keyOf(f, 2));
  });

  test("a refused email fails at once", async () => {
    const f = replies(422);
    await expect(sendEmail(msg)).rejects.toThrow("Resend said 422");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("it gives up after three tries", async () => {
    const f = replies(500, 500, 500, 200);
    await expect(sendEmail(msg)).rejects.toThrow("Resend said 500");
    expect(f).toHaveBeenCalledTimes(3);
  });
});
