import { expect, test } from "vitest";
import { bodyText } from "./google";

const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_");

test("a designed email with only HTML shows its words, not its style code", () => {
  const html = `<html><head><style>#outlook a { padding:0; } body { margin:0; }</style></head><body><p>Hi Vandana, get excited</p></body></html>`;
  const text = bodyText({ mimeType: "text/html", body: { data: b64(html) } });
  expect(text).toBe("Hi Vandana, get excited");
});

test("the plain-text part wins when there is one", () => {
  const part = { mimeType: "multipart/alternative", parts: [
    { mimeType: "text/plain", body: { data: b64("Plain hello") } },
    { mimeType: "text/html", body: { data: b64("<p>Html hello</p>") } },
  ] };
  expect(bodyText(part)).toBe("Plain hello");
});
