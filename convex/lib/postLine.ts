// Small helpers for the daily jobs post (26 Nov 2026).

/** Keeps an AI-read detail (years, pay) only when every number in it is in the job's own text, so the post
 * never shows experience or pay the posting didn't state. */
export function stated(value: string, text: string) {
  const v = value.replace(/\s+/g, " ").trim();
  const nums = v.match(/\d+(?:[.,]\d+)*/g);
  if (!v || !nums) return "";
  // Whole numbers only: "18" mustn't pass because the text says "18,00,000".
  const inText = new Set((text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));
  return nums.every((n) => inText.has(n.replace(/,/g, ""))) ? v : "";
}

/** "3-6 yrs · ₹8-10 L · Books meetings for US AEs." with whatever parts are known. */
export function composeLine(years: string, pay: string, line: string) {
  return [years, pay, line].map((s) => s.trim()).filter(Boolean).join(" · ");
}

/** "Samsara, Freshworks and Rippling are hiring sales in India this week 👇": up to three companies, in post order. */
export function postHook(companies: string[], count: number) {
  const names = [...new Set(companies)].slice(0, 3);
  if (names.length === 1) return `${names[0]} is hiring ${count === 1 ? "in sales" : `${count} sales roles`} in India this week 👇`;
  const list = names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} are hiring sales in India this week 👇`;
}
