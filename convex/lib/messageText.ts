// A short LinkedIn note laid out to read easily: the greeting on its own line, then short paragraphs,
// and the ask kept together at the end. Notes the AI wrote as one block (all of them before 13 Nov) get the same layout.

const GREETING = /^((?:hi|hey|hello|dear)\s+[^,.!?\n]{1,40}[,!])\s*/i;
// The closing sentences: the question, the easy out, the sign-off.
const ASK = /\?|totally fine|no worries|either way|cv attached|thanks|thank you|cheers|regards/i;

/** Splits on sentence ends, but not inside links or numbers like "3.5". */
function sentences(text: string) {
  return text.split(/(?<=[.!?])\s+(?=["'(A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

export function tidyMessage(text: string) {
  const t = text.trim();
  // Already laid out with blank lines: keep the writer's own layout.
  if (!t || /\n\s*\n/.test(t)) return t;
  let body = t.replace(/\s*\n\s*/g, " ");
  const parts: string[] = [];
  const hello = body.match(GREETING);
  if (hello) {
    parts.push(hello[1]);
    body = body.slice(hello[0].length);
    body = body.charAt(0).toUpperCase() + body.slice(1);
  }
  const all = sentences(body);
  // The ask starts at the first closing sentence in the last three, so "Would you...? Totally fine if not. CV attached." stays one paragraph.
  let askFrom = all.length;
  for (let i = Math.max(0, all.length - 3); i < all.length; i++) {
    if (ASK.test(all[i])) {
      askFrom = i;
      break;
    }
  }
  const main = all.slice(0, askFrom);
  for (let i = 0; i < main.length; i += 2) parts.push(main.slice(i, i + 2).join(" "));
  if (askFrom < all.length) parts.push(all.slice(askFrom).join(" "));
  return parts.join("\n\n");
}
