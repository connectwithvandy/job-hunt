import { describe, expect, it } from "vitest";
import { pickOwnMessages } from "./lib/chats";

const long = (s: string) => `${s} ${"and a bit more so this reads like a real message someone typed out by hand. ".repeat(2)}`;

describe("pickOwnMessages", () => {
  it("skips short replies, templates and link drops", () => {
    const picked = pickOwnMessages([
      { text: "Thanks!", at: 1 },
      { text: long("Hi Sam, quick one, Acme Corp has a role open"), at: 2 },
      { text: long("Hi Lee, quick one, Acme Corp has a role open"), at: 3 },
      { text: long("See this https://example.com"), at: 4 },
      { text: long("Great talk yesterday, the bit on pipeline stuck with me"), at: 5 },
      { text: long("Happy to share notes from our last offsite if useful"), at: 6 },
      { text: long("Congrats on the new team, it was a long time coming"), at: 7 },
    ]);
    expect(picked).toHaveLength(3);
    expect(picked.join(" ")).not.toMatch(/Acme|https|^Thanks!$/);
  });
  it("returns nothing when there's too little to hear a tone", () => {
    expect(pickOwnMessages([{ text: long("Just one long message here"), at: 1 }, { text: "ok", at: 2 }])).toEqual([]);
  });
});
