import { describe, expect, it } from "vitest";
import { isInternalAccount } from "./lib/internalAccounts";

describe("isInternalAccount", () => {
  const owners = ["owner@gmail.com"];
  it("counts the owner and her +tagged test accounts", () => {
    expect(isInternalAccount("owner@gmail.com", owners)).toBe(true);
    expect(isInternalAccount("Owner+test1@gmail.com", owners)).toBe(true);
    expect(isInternalAccount("uxtest3@example.com", owners)).toBe(true);
  });
  it("leaves real members in", () => {
    expect(isInternalAccount("someone@gmail.com", owners)).toBe(false);
    expect(isInternalAccount("owner@jobpipe.in", owners)).toBe(false);
    expect(isInternalAccount(undefined, owners)).toBe(false);
  });
});
