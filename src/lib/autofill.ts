// The JobPipe autofill bookmarklet. Clicked on an application form (Greenhouse, Lever, Ashby,
// Workday and most others), it fills each field whose label matches one of your saved answers.
// Your answers are baked into the bookmark when you drag it, so nothing is fetched from JobPipe.

type Answer = { question: string; answer: string };

/**
 * Runs inside the application page, as plain JavaScript kept in a string: a compiled function
 * can pick up bundler helpers that don't exist on other sites.
 */
const FILL_SOURCE = String.raw`function (answers) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const get = (q) => answers.find((a) => norm(a.question) === norm(q))?.answer ?? "";
  const fullName = get("Full name");
  const [first, ...rest] = fullName.split(/\s+/);
  const last = rest.join(" ");

  // Common labels first, mapped to the answer they need; anything else is matched by shared words.
  const rules = [
    [/\bfirst name\b|\bgiven name\b/, () => first],
    [/\blast name\b|\bsurname\b|\bfamily name\b/, () => last],
    [/\bfull name\b|^name$|^your name$/, () => fullName],
    [/\bemail\b/, () => get("Email")],
    [/\bphone\b|\bmobile\b|\bcontact number\b/, () => get("Phone")],
    [/linkedin/, () => get("LinkedIn profile")],
    [/\b(current|present) (company|employer|organi[sz]ation)\b|\bemployer\b/, () => get("Current company")],
    [/\b(current|present) (job )?(title|role|designation|position)\b/, () => get("Current job title")],
    [/\b(city|location)\b/, () => get("Current location")],
    [/\bnotice\b/, () => get("Notice period")],
    [/\bexpected\b.*\b(ctc|salary|compensation|pay)\b|\bsalary expectation/, () => get("Expected CTC")],
    [/\bcurrent\b.*\b(ctc|salary|compensation|pay)\b/, () => get("Current CTC (fixed + variable)")],
    [/\byears\b.*\bexperience\b|\bexperience\b.*\byears\b/, () => get("Total years of experience")],
    [/\bsponsor/, () => get("Need visa sponsorship?")],
    [/\bauthori[sz]ed\b|\bwork authori[sz]ation\b|\bright to work\b/, () => get("Work authorization")],
    [/\brelocat/, () => get("Willing to relocate?")],
    [/\bstart date\b|\bwhen can you start\b|\bavailab/, () => get("Earliest start date")],
    [/\bhear about\b|\bhow did you find\b|\bsource\b/, () => get("How did you hear about us?")],
    [/\bwhy\b.*\b(leav|mov|chang|look)/, () => get("Why are you looking to move?")],
    [/\btravel\b/, () => get("Willing to travel?")],
    [/\buniversity\b|\bcollege\b|\bschool\b/, () => get("University")],
    [/\bdegree\b|\bqualification\b/, () => get("Highest degree")],
  ];
  const fuzzy = (label) => {
    const words = new Set(label.split(" ").filter((w) => w.length > 3));
    let best = { score: 0, answer: "" };
    for (const a of answers) {
      const q = norm(a.question).split(" ").filter((w) => w.length > 3);
      if (!q.length) continue;
      const score = q.filter((w) => words.has(w)).length / q.length;
      if (score > best.score) best = { score, answer: a.answer };
    }
    return best.score >= 0.6 ? best.answer : "";
  };

  const labelOf = (el) => {
    const parts = [];
    const id = el.getAttribute("id");
    if (id) document.querySelectorAll('label[for="' + CSS.escape(id) + '"]').forEach((l) => parts.push(l.textContent ?? ""));
    const by = el.getAttribute("aria-labelledby");
    if (by) by.split(/\s+/).forEach((i) => parts.push(document.getElementById(i)?.textContent ?? ""));
    parts.push(el.closest("label")?.textContent ?? "", el.getAttribute("aria-label") ?? "", el.getAttribute("placeholder") ?? "", el.getAttribute("name") ?? "");
    // Many forms put the question in the field's wrapper rather than a <label>.
    if (!parts.join("").trim()) parts.push(el.parentElement?.parentElement?.textContent?.slice(0, 200) ?? "");
    return norm(parts.join(" "));
  };
  const answerFor = (label) => {
    // An empty saved answer doesn't stop the search: "current role" in a "why leave" question should fall through.
    for (const [re, value] of rules) if (re.test(label) && value()) return value();
    return fuzzy(label);
  };
  const setValue = (el, value) => {
    // React and similar frameworks only notice values set through the native setter.
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const mark = (el) => {
    el.style.outline = "2px solid #c6ff3d";
    el.style.outlineOffset = "1px";
  };

  let filled = 0;
  document.querySelectorAll("input, textarea").forEach((el) => {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (["hidden", "submit", "button", "file", "checkbox", "radio", "password"].includes(type) || el.disabled || el.readOnly || el.value) return;
    const value = answerFor(labelOf(el));
    if (!value) return;
    setValue(el, value);
    mark(el);
    filled++;
  });
  document.querySelectorAll("select").forEach((el) => {
    if (el.disabled || (el.selectedIndex > 0 && el.value)) return;
    const value = norm(answerFor(labelOf(el)));
    if (!value) return;
    const opt = Array.from(el.options).find((o) => o.value && (norm(o.text) === value || value.startsWith(norm(o.text)) || norm(o.text).startsWith(value)));
    if (!opt) return;
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    mark(el);
    filled++;
  });
  // Yes / No questions as radio buttons.
  const groups = new Map();
  document.querySelectorAll('input[type="radio"]').forEach((r) => groups.set(r.name, (groups.get(r.name) ?? []).concat(r)));
  groups.forEach((radios) => {
    if (radios.some((r) => r.checked)) return;
    const question = norm(radios[0].closest("fieldset")?.querySelector("legend")?.textContent ?? radios[0].parentElement?.parentElement?.parentElement?.textContent?.slice(0, 200) ?? "");
    const value = norm(answerFor(question));
    const yes = value.startsWith("yes");
    const no = value.startsWith("no");
    if (!yes && !no) return;
    const pick = radios.find((r) => norm(labelOf(r)).split(" ").includes(yes ? "yes" : "no"));
    if (!pick) return;
    pick.click();
    mark(pick);
    filled++;
  });

  const note = document.createElement("div");
  note.textContent = filled
    ? "JobPipe filled " + filled + (filled === 1 ? " field" : " fields") + " (outlined in green). Check them before you submit; upload your CV yourself."
    : "JobPipe didn't find fields it recognises here. If the form sits inside a box on the page, open it in its own tab and try again.";
  note.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:12px 14px;border-radius:12px;background:#0b0b0f;color:#f4f4f5;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)");
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 9000);
}`;

/** The bookmark's address: the fill function plus your answers. */
export function autofillBookmarklet(answers: Answer[]) {
  const usable = answers.filter((a) => a.question.trim() && a.answer.trim());
  return `javascript:${encodeURIComponent(`(${FILL_SOURCE})(${JSON.stringify(usable)});void 0`)}`;
}
