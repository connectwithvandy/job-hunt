// The JobPipe autofill bookmarklet. Clicked on an application form (Greenhouse, Lever, Ashby,
// Workday and most others), it fills each field whose label matches one of your answers.
// The current bookmark opens a small jobpipe.in/fill window, which sends this job's answers, your
// tailored CV and cover letter straight to the form page. Older bookmarks carry the answers baked in.

/**
 * Runs inside the application page, as plain JavaScript kept in a string: a compiled function
 * can pick up bundler helpers that don't exist on other sites. It never presses Submit or any button
 * inside a real form; the person checks everything and submits themselves.
 */
export const FILL_SOURCE = String.raw`async function (answers, files) {
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const get = (q) => answers.find((a) => norm(a.question) === norm(q))?.answer ?? "";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fullName = get("Full name");
  const [first, ...rest] = fullName.split(/\s+/);
  const last = rest.join(" ");

  const COUNTRIES = [["united states", "u s", "usa", "us", "america"], ["united kingdom", "uk", "britain", "england"], ["canada"], ["australia"], ["germany"], ["ireland"], ["singapore"], ["india"], ["uae", "united arab emirates", "dubai"], ["european union", "eu", "europe"], ["netherlands"], ["france"], ["japan"], ["new zealand"]];
  const countriesIn = (text) => COUNTRIES.filter((names) => names.some((n) => (" " + text + " ").includes(" " + n + " "))).map((names) => names[0]);
  // Location pickers write countries their own way ("Bengaluru, Karnataka, IND", "India +91"). Only used to compare
  // a picker's option with the person's country, never to read a question (where "are" or "can" are plain words).
  const CODES = { "united states": ["usa", "us", "united states of america"], "united kingdom": ["gbr", "gb", "uk", "great britain"], canada: ["can", "ca"], australia: ["aus", "au"], germany: ["deu", "de"], ireland: ["irl", "ie"], singapore: ["sgp", "sg"], india: ["ind", "in"], uae: ["are", "ae", "united arab emirates"], netherlands: ["nld", "nl"], france: ["fra", "fr"], japan: ["jpn", "jp"], "new zealand": ["nzl", "nz"] };
  const countryName = (s) => {
    const t = norm(s);
    for (const names of COUNTRIES) if (names.includes(t)) return names[0];
    for (const [name, codes] of Object.entries(CODES)) if (codes.includes(t)) return name;
    return "";
  };
  const sameCountry = (a, b) => !!countryName(a) && countryName(a) === countryName(b);
  // "Bengaluru, Karnataka, India" -> "India": the person's country, for "Country" boxes.
  const countryOf = (loc) => {
    const parts = String(loc).split(",").map((p) => p.trim()).filter(Boolean);
    const lastPart = parts[parts.length - 1] ?? "";
    return countryName(lastPart) ? lastPart : "";
  };

  // Common labels first, each mapped to the saved answer it needs; anything else is matched by shared words.
  const rules = [
    // "Legal First and Last Name" wants the whole name; checked before the first/last rules, which caught it as a last name.
    [/\bfirst and last name\b|\bfull legal name\b|\blegal name\b/, "Full name"],
    [/\bfirst name\b|\bgiven name\b/, "First name"],
    [/\blast name\b|\bsurname\b|\bfamily name\b/, "Last name"],
    // Ashby labels its name box "Name" with the field name "_systemfield_name" beside it.
    [/\bfull name\b|^name$|^your name$|^name systemfield name$/, "Full name"],
    [/\bemail\b/, "Email"],
    [/\bphone\b|\bmobile\b|\bcontact number\b/, "Phone"],
    [/linkedin/, "LinkedIn profile"],
    [/\b(current|present) (company|employer|organi[sz]ation)\b|\bemployer\b/, "Current company"],
    [/\b(current|present) (job )?(title|role|designation|position)\b/, "Current job title"],
    [/^country\b|\bcountry of residence\b|\bcountry (you|where you) (live|reside)/, "Country"],
    [/\b(city|location)\b|\baddress\b|\bworking from\b|\bbased (in|out of)\b/, "Current location"],
    [/\bnotice\b/, "Notice period"],
    [/\bexpected\b.*\b(ctc|salary|compensation|pay)\b|\b(salary|compensation|pay) expectation/, "Expected CTC"],
    [/\bcurrent\b.*\b(ctc|salary|compensation|pay)\b/, "Current CTC (fixed + variable)"],
    [/\byears\b.*\bexperience\b|\bexperience\b.*\byears\b/, "Total years of experience"],
    [/\bsponsor/, "Need visa sponsorship?"],
    [/\bauthori[sz]ed\b|\bwork authori[sz]ation\b|\bright to work\b/, "Work authorization"],
    [/\brelocat/, "Willing to relocate?"],
    [/\bstart date\b|\bwhen can you start\b|\bavailab/, "Earliest start date"],
    [/\bhear about\b|\bhow did you find\b|\bsource\b/, "How did you hear about us?"],
    [/\bwhy\b.*\b(leav|mov|chang|look)/, "Why are you looking to move?"],
    [/\btravel\b/, "Willing to travel?"],
    [/\buniversity\b|\bcollege\b|\bschool\b/, "University"],
    [/\bdegree\b|\bqualification\b/, "Highest degree"],
    [/\bcover letter\b/, "Cover letter"],
  ];
  const valueOf = (key) => {
    if (key === "First name") return first ?? "";
    if (key === "Last name") return last;
    if (key === "Full name") return fullName;
    if (key === "Country") return countryOf(get("Current location"));
    return get(key);
  };
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

  // The question above a field that has no <label> of its own: the nearest label, legend or "...label" box that
  // holds no field itself (Lever puts its own questions in a div called "application-label").
  const questionEl = (el) => {
    const legend = el.closest("fieldset")?.querySelector("legend");
    if (legend && legend.textContent.trim()) return legend;
    let box = el;
    for (let i = 0; i < 6 && box.parentElement; i++) {
      box = box.parentElement;
      // A label that names another field (Ashby's "Phone" above its text-message consent) isn't this one's question.
      const l = Array.from(box.querySelectorAll('label, legend, [class*="label"]')).find(
        (n) => n.textContent.trim() && !n.querySelector("input, textarea, select, button") && !(n.htmlFor && n.htmlFor !== el.id && document.getElementById(n.htmlFor)),
      );
      if (l) return l;
    }
    return null;
  };
  // The element holding a field's question: its <label>, the label it's inside, or the question above it.
  const labelEl = (el) => {
    const id = el.getAttribute("id");
    const forIt = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
    if (forIt && forIt.textContent.trim()) return forIt;
    const by = el.getAttribute("aria-labelledby");
    const named = by ? document.getElementById(by.split(/\s+/)[0]) : null;
    if (named && named.textContent.trim()) return named;
    const around = el.closest("label");
    if (around) return around.querySelector('[class*="label"]') ?? around;
    return questionEl(el);
  };
  const labelOf = (el) => {
    const parts = [];
    const id = el.getAttribute("id");
    if (id) document.querySelectorAll('label[for="' + CSS.escape(id) + '"]').forEach((l) => parts.push(l.textContent ?? ""));
    const by = el.getAttribute("aria-labelledby");
    if (by) by.split(/\s+/).forEach((i) => parts.push(document.getElementById(i)?.textContent ?? ""));
    parts.push(el.closest("label")?.textContent ?? "", el.getAttribute("aria-label") ?? "");
    // Many forms put the question in a box above the field rather than a <label> (Lever's own questions, Ashby's location).
    if (!parts.join("").trim()) parts.push(questionEl(el)?.textContent ?? "");
    parts.push(el.getAttribute("placeholder") ?? "", el.getAttribute("name") ?? "");
    if (!parts.join("").trim()) parts.push(el.parentElement?.parentElement?.textContent?.slice(0, 200) ?? "");
    return norm(parts.join(" "));
  };
  const short = (t) => {
    const s = String(t ?? "").replace(/[*✱]/g, "").replace(/\s+/g, " ").trim();
    return s.length > 70 ? s.slice(0, 67).trim() + "…" : s;
  };
  // The question as the person reads it, for the "left for you" list.
  const shownLabel = (el) => short(labelEl(el)?.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
  const starred = (l) => !!l && (/[*✱]/.test(l.textContent ?? "") || /required/i.test(String(l.className)));
  const isRequired = (el) => el.required || el.getAttribute("aria-required") === "true" || starred(labelEl(el));

  // This form's own questions, read ahead by JobPipe: matched on the form's exact wording first.
  // One left blank on purpose (like "who referred you? their email") stays blank instead of falling to the rules below.
  // Matched on the question's first 40 characters: forms often show only its first sentence as the label.
  const exact = answers.filter((a) => a.exact).map((a) => ({ q: norm(a.question).slice(0, 40), answer: a.answer })).filter((a) => a.q.length > 3);
  // Tested on live Greenhouse, Lever and Ashby forms (23 Nov): a wrong answer is worse than a blank one, so
  // a real question ("How are you using AI today in your current role?") never gets a profile field like a job
  // title; a yes/no question ("Do you have 1 to 3 years of closing experience?") never gets a number; and a
  // question about one country's work rights never gets an answer about another country.
  const QUESTION = /^(do|does|did|are|is|have|has|will|would|can|could|how|what|why|which|when|where|describe|tell|please|share|explain|give)\b/;
  const YES_NO = /^(do|does|did|are|is|have|has|will|would|can|could)\b/;
  const SAFE_IN_QUESTIONS = new Set(["How did you hear about us?", "Need visa sponsorship?", "Work authorization", "Willing to relocate?", "Notice period", "Earliest start date", "Expected CTC", "Current CTC (fixed + variable)", "Why are you looking to move?", "Willing to travel?", "Total years of experience", "Current location"]);
  // Choices only the person can make: consent, legal statements, and demographic questions. Never picked for them.
  const PERSONAL = /arbitrat|agreement|consent|acknowledg|certif|attest|privacy|policy|terms|declar|gender|race|ethnic|hispanic|latino|veteran|disabilit|pronoun|sexual orientation|criminal|convict|\bsms\b|whatsapp|text message/;
  const answerInfo = (label) => {
    for (const a of exact) if (label.includes(a.q)) return { answer: a.answer, key: "exact" };
    const question = QUESTION.test(label) && label.split(" ").length > 4;
    // An empty saved answer doesn't stop the search: "current role" in a "why leave" question should fall through.
    for (const [re, key] of rules) {
      const value = valueOf(key);
      if (!re.test(label) || !value) continue;
      if (question && !SAFE_IN_QUESTIONS.has(key)) continue;
      if (key === "Total years of experience" && YES_NO.test(label)) continue;
      if (key === "Need visa sponsorship?" || key === "Work authorization" || key === "Willing to relocate?") {
        const asked = countriesIn(label);
        const said = countriesIn(norm(value));
        if (asked.length && !asked.some((c) => said.includes(c))) continue;
      }
      return { answer: value, key };
    }
    return { answer: question ? "" : fuzzy(label), key: "fuzzy" };
  };
  const answerFor = (label) => answerInfo(label).answer;

  // What kind of choice a dropdown answer is, which decides how strictly an option has to match it.
  const kindOf = (label, info) => {
    if (info.key === "Country") return "country";
    if (/^(yes|no)\b/.test(norm(info.answer))) return "yesno";
    if (info.key === "Current location" || /\b(city|location|based in|working from|where do you (live|plan))\b/.test(label)) return "place";
    return "text";
  };
  const ALIAS = { bangalore: "bengaluru", bombay: "mumbai", gurgaon: "gurugram", madras: "chennai", calcutta: "kolkata", "new delhi": "delhi" };
  const city = (s) => ALIAS[norm(s)] ?? norm(s);
  // "India +91" -> "india": phone pickers add the dialling code.
  const optText = (o) => norm(String(o.textContent ?? "").replace(/\+\s?\d[\d\s-]*$/, ""));
  // Picks an option only when it clearly is the answer; otherwise null, and the person picks it.
  const matchOption = (opts, answer, kind) => {
    const want = norm(answer);
    if (!want) return null;
    const same = opts.filter((o) => optText(o) === want);
    if (same.length === 1) return same[0];
    if (kind === "yesno") {
      const yn = want.startsWith("yes") ? "yes" : "no";
      const hits = opts.filter((o) => optText(o) === yn || optText(o).startsWith(yn + " "));
      return hits.length === 1 ? hits[0] : null;
    }
    if (kind === "country") {
      const hits = opts.filter((o) => sameCountry(optText(o), want));
      return hits.length === 1 ? hits[0] : null;
    }
    if (kind === "place") {
      const segs = String(answer).split(",").map(norm).filter(Boolean);
      const hits = opts.filter((o) => {
        const parts = String(o.textContent ?? "").split(",").map(norm).filter(Boolean);
        if (!parts.length || city(parts[0]) !== city(segs[0])) return false;
        return segs.slice(1).every((s) => parts.some((p) => p === s || sameCountry(p, s)));
      });
      if (!hits.length) return null;
      // The search lists the main city first. With only a city name, take it only if every match is in one country.
      if (segs.length > 1) return hits[0];
      const countries = new Set(hits.map((o) => norm(String(o.textContent).split(",").pop())));
      return countries.size === 1 ? hits[0] : null;
    }
    return null;
  };

  const setNative = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  };
  const setValue = (el, value) => {
    // React and similar frameworks only notice values set through the native setter.
    setNative(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const mark = (el) => {
    el.style.outline = "2px solid #c6ff3d";
    el.style.outlineOffset = "1px";
  };
  const shown = (el) => el.getClientRects().length > 0;
  // The phone box's country-code search and the spam check are never ours to fill.
  // Hidden helper boxes (Greenhouse keeps one behind each dropdown to check it was answered) aren't questions either.
  const phonePicker = (el) => /iti__search|recaptcha/i.test(String(el.className) + " " + (el.id ?? "") + " " + (el.getAttribute("name") ?? "")) || /^iti-/.test(el.id ?? "") || !!el.closest(".iti, .iti--container, .g-recaptcha");
  const foreign = (el) =>
    (phonePicker(el) && !/iti__tel-input/.test(String(el.className))) ||
    /requiredinput/i.test(String(el.className)) ||
    el.getAttribute("aria-hidden") === "true" ||
    (el.tabIndex < 0 && el.getAttribute("role") !== "combobox");

  // Search-as-you-type dropdowns: Greenhouse's react-select boxes, Ashby's location box, Lever's location box.
  const isCombo = (el) => el.getAttribute("role") === "combobox" || !!el.getAttribute("aria-autocomplete") || !!el.parentElement?.querySelector(".dropdown-results");
  const comboFilled = (el) => !!el.value.trim() || !!el.closest('[class*="control"]')?.querySelector('[class*="single-value"], [class*="multi-value"]');
  const optionsFor = (el) => {
    let list = [];
    for (const id of (el.getAttribute("aria-controls") || el.getAttribute("aria-owns") || "").split(/\s+/).filter(Boolean)) {
      const box = document.getElementById(id);
      if (box) list.push(...box.querySelectorAll('[role="option"]'));
    }
    let box = el;
    for (let i = 0; i < 6 && !list.length && box.parentElement; i++) {
      box = box.parentElement;
      list = Array.from(box.querySelectorAll('[role="option"], .dropdown-location'));
    }
    if (!list.length) list = Array.from(document.querySelectorAll('[role="option"]'));
    return list.filter((o) => shown(o) && !phonePicker(o));
  };
  // Waits until the options stop changing (city searches load from the network), up to 5 seconds.
  const waitOptions = async (el) => {
    let before = "";
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      const opts = optionsFor(el);
      const text = opts.map((o) => o.textContent).join("|");
      if (opts.length && !/loading|searching/i.test(text) && text === before) return opts;
      before = text;
    }
    return optionsFor(el).filter((o) => !/loading|searching/i.test(o.textContent ?? ""));
  };
  const typeInto = (el, text) => {
    el.focus();
    // Greenhouse opens its menu on a press and release of the box.
    const control = el.closest('[class*="control"]');
    if (control && control !== el) {
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      control.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    }
    setNative(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const t of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(t, { key: text.slice(-1) || "a", bubbles: true }));
  };
  const clearCombo = (el) => {
    setNative(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    el.blur();
  };
  // Options pick on a press (Lever) or a click (Greenhouse, Ashby): send each until the menu closes.
  const choose = async (el, opt) => {
    for (const t of ["mouseover", "mousedown", "mouseup", "click"]) {
      if (!opt.isConnected) break;
      opt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, button: 0 }));
      await sleep(t === "mouseover" ? 30 : 120);
    }
    await sleep(200);
    return !opt.isConnected || el.getAttribute("aria-expanded") !== "true";
  };
  const fillCombo = async (el, label) => {
    const info = answerInfo(label);
    if (!info.answer || PERSONAL.test(label)) return false;
    const kind = kindOf(label, info);
    const head = String(info.answer).split(",")[0].trim();
    const tries = kind === "yesno" ? [norm(info.answer).startsWith("yes") ? "Yes" : "No"] : kind === "place" ? [head, ...Object.entries(ALIAS).filter(([a, b]) => norm(head) === a || norm(head) === b).map(([a, b]) => (norm(head) === a ? b : a))] : [String(info.answer).slice(0, 60)];
    for (const text of tries) {
      typeInto(el, text);
      const opt = matchOption(await waitOptions(el), info.answer, kind);
      if (opt && (await choose(el, opt))) return true;
    }
    clearCombo(el);
    return false;
  };

  const note = document.createElement("div");
  note.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:12px 14px;border-radius:12px;background:#0b0b0f;color:#f4f4f5;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:pointer");
  note.textContent = "JobPipe is filling this form…";
  note.title = "Click to close";
  note.addEventListener("click", () => note.remove());
  document.body.appendChild(note);

  let filled = 0;
  const combos = [];
  const typed = [];
  const texts = Array.from(document.querySelectorAll("input, textarea")).filter((el) => {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    return !["hidden", "submit", "button", "file", "checkbox", "radio", "password", "image", "reset"].includes(type) && !el.disabled && !el.readOnly && !foreign(el);
  });
  for (const el of texts) {
    if (isCombo(el)) {
      if (shown(el)) combos.push(el);
      continue;
    }
    if (el.value) continue;
    const value = answerFor(labelOf(el));
    if (!value) continue;
    setValue(el, value);
    mark(el);
    typed.push([el, value]);
    filled++;
  }
  document.querySelectorAll("select").forEach((el) => {
    if (el.disabled || (el.selectedIndex > 0 && el.value)) return;
    const label = labelOf(el);
    const info = answerInfo(label);
    if (!info.answer || PERSONAL.test(label)) return;
    const opt = matchOption(Array.from(el.options).filter((o) => o.value), info.answer, kindOf(label, info));
    if (!opt) return;
    setNative(el, opt.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    mark(el);
    filled++;
  });
  // Questions as radio buttons (Lever's yes/no questions): the option that clearly matches the answer, or none.
  const groups = new Map();
  document.querySelectorAll('input[type="radio"]').forEach((r) => groups.set(r.name, (groups.get(r.name) ?? []).concat(r)));
  const radioQuestion = (radios) => questionEl(radios[0])?.textContent ?? "";
  groups.forEach((radios) => {
    if (radios.some((r) => r.checked)) return;
    const question = norm(radioQuestion(radios));
    if (!question || PERSONAL.test(question)) return;
    const info = answerInfo(question);
    if (!info.answer) return;
    const choices = radios.map((r) => ({ el: r, textContent: r.closest("label")?.textContent || labelEl(r)?.textContent || r.value }));
    const pick = matchOption(choices, info.answer, kindOf(question, info));
    if (!pick || PERSONAL.test(norm(pick.textContent))) return;
    pick.el.click();
    mark(pick.el);
    filled++;
  });
  // Yes / No questions as a pair of buttons (Ashby). A button inside a real <form> could send it, so those are left alone.
  const yesNoBoxes = new Set();
  document.querySelectorAll("button").forEach((b) => {
    if (["yes", "no"].includes(norm(b.textContent)) && b.parentElement) yesNoBoxes.add(b.parentElement);
  });
  const pressed = (b) => b.getAttribute("aria-pressed") === "true" || /\b_?(active|selected)/i.test(String(b.className));
  const yesNoPairs = [];
  yesNoBoxes.forEach((box) => {
    const buttons = Array.from(box.children).filter((b) => b.tagName === "BUTTON" && ["yes", "no"].includes(norm(b.textContent)));
    if (buttons.length !== 2 || buttons.some((b) => b.closest("form"))) return;
    yesNoPairs.push({ box, buttons });
    if (buttons.some(pressed)) return;
    const question = norm(labelEl(box)?.textContent ?? "");
    if (!question || PERSONAL.test(question)) return;
    const value = norm(answerFor(question));
    const pick = buttons.find((b) => norm(b.textContent) === (value.startsWith("yes") ? "yes" : value.startsWith("no") ? "no" : "-"));
    if (!pick) return;
    pick.click();
    mark(pick);
    filled++;
  });
  // Dropdowns you search in, one at a time: each opens its own menu.
  for (const el of combos) {
    if (comboFilled(el)) continue;
    if (await fillCombo(el, labelOf(el))) {
      mark(el.closest('[class*="control"]') ?? el);
      filled++;
    }
  }
  // Picking a country can reset the phone box beside it (Greenhouse): put back anything a pick wiped.
  for (const [el, value] of typed) if (el.isConnected && !el.value) setValue(el, value);

  // The tailored CV and cover letter, attached to the form's upload fields. Ashby's "autofill from resume" box
  // isn't one: it reads the file and rewrites the answers.
  const attached = [];
  // An upload button often says only "Attach": the question is in a box a few levels up. Read the nearest box
  // that names a CV, a cover letter or Ashby's autofill, stopping before one that holds another upload.
  // Read before anything is attached: Greenhouse swaps an upload for the file's name once it has one.
  const fileLabel = (el) => {
    let box = el;
    for (let i = 0; i < 6 && box.parentElement && box.parentElement !== document.body && box.parentElement.querySelectorAll('input[type="file"]').length === 1; i++) {
      box = box.parentElement;
      const t = norm((box.textContent ?? "").slice(0, 200));
      if (/resume|\bcv\b|curriculum|cover|autofill|auto fill/.test(t)) return labelOf(el) + " " + t;
    }
    return labelOf(el);
  };
  const fileLabels = new Map(Array.from(document.querySelectorAll('input[type="file"]')).map((el) => [el, fileLabel(el)]));
  const uploads = Array.from(fileLabels.keys()).filter((el) => !el.disabled && !/autofill|auto fill/.test(fileLabels.get(el)));
  const inputs = uploads.filter((el) => !(el.files && el.files.length));
  const attach = (file, re, fallback) => {
    const el = inputs.find((i) => re.test(fileLabels.get(i)) && (fallback ? !/cover/.test(fileLabels.get(i)) : true)) ?? (fallback && inputs.length === 1 && !/cover/.test(fileLabels.get(inputs[0])) ? inputs[0] : null);
    if (!el || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      inputs.splice(inputs.indexOf(el), 1);
      mark(el.parentElement ?? el);
      return true;
    } catch (e) {
      return false;
    }
  };
  for (const f of files ?? []) {
    if (f.kind === "cv" && attach(f.file, /resume|\bcv\b|curriculum/, true)) attached.push("CV");
    if (f.kind === "letter" && attach(f.file, /cover/, false)) attached.push("cover letter");
  }

  // What's still blank, by question, so the person knows exactly what to do next.
  await sleep(300);
  const left = [];
  let optionalLeft = 0;
  const blank = (el, label) => {
    if (!label) return;
    if (isRequired(el)) {
      if (!left.includes(label)) left.push(label);
    } else optionalLeft++;
  };
  for (const el of texts) if (el.isConnected && shown(el) && (isCombo(el) ? !comboFilled(el) : !el.value.trim())) blank(el, shownLabel(el));
  document.querySelectorAll("select").forEach((el) => {
    if (!el.disabled && shown(el) && !(el.selectedIndex > 0 && el.value)) blank(el, shownLabel(el));
  });
  // Radio and tick-box questions count once each, by the question above them.
  const blankGroup = (els) => {
    const first = short(els[0].closest("label")?.textContent || labelEl(els[0])?.textContent || els[0].value);
    const label = short(questionEl(els[0])?.textContent) || (first ? "the choice with “" + first + "”" : "");
    if (!label) return;
    if (els.some((e) => e.required || e.getAttribute("aria-required") === "true") || starred(questionEl(els[0]))) {
      if (!left.includes(label)) left.push(label);
    } else optionalLeft++;
  };
  groups.forEach((radios) => {
    if (!radios.some((r) => r.checked) && radios.some(shown)) blankGroup(radios);
  });
  const ticks = new Map();
  document.querySelectorAll('input[type="checkbox"]').forEach((c) => c.name && ticks.set(c.name, (ticks.get(c.name) ?? []).concat(c)));
  ticks.forEach((list) => {
    if (list.length > 1 && !list.some((c) => c.checked) && list.some(shown)) blankGroup(list);
  });
  for (const p of yesNoPairs) if (!p.buttons.some(pressed)) blank(p.box, shownLabel(p.box));
  for (const el of uploads) if (el.isConnected && !(el.files && el.files.length) && isRequired(el)) blank(el, shownLabel(el));

  const leftText = left.length
    ? " " + left.length + (left.length === 1 ? " required question is" : " required questions are") + " still blank, for you to answer: " + (left.slice(0, 6).join("; ") + (left.length > 6 ? "; and " + (left.length - 6) + " more" : "") + ".").replace(/[?.…]\.$/, (m) => m[0])
    : "";
  note.textContent = filled || attached.length
    ? "JobPipe filled " + filled + (filled === 1 ? " field" : " fields") + (attached.length ? " and attached your " + attached.join(" and ") : "") + " (outlined in green)." + leftText + " Check everything, then press Submit yourself." + (files && files.length && !attached.includes("CV") ? " Attach your CV yourself: Apply saved it to your Downloads." : "")
    : "JobPipe didn't find fields it recognises here. If the form sits inside a box on the page, open it in its own tab and try again.";
  setTimeout(() => note.remove(), 60000);
  return { filled, attached, left, optionalLeft };
}`;

/**
 * Bumped whenever the fill code changes. The code is copied into the bookmark when it's dragged, so an older
 * bookmark keeps old rules: the fill window sees the missing or older number and asks for a fresh drag.
 * 2: 23 Nov, stopped wrong answers to questions (country work rights, yes/no, "current role" in a question).
 * 3: 23 Nov, picks dropdown options you search in (city, country, yes/no), Ashby's yes/no buttons, lists the
 *    required questions left blank, and never attaches the CV to Ashby's "autofill from resume" box.
 */
export const BOOKMARK_VERSION = 3;

/**
 * The current bookmark: opens jobpipe.in/fill, which posts back this job's answers and files.
 * Only a message from `origin` is accepted, and nothing is baked in, so it never goes out of date.
 */
export function liveBookmarklet(origin: string) {
  const o = JSON.stringify(origin);
  const src = `(function(){var o=${o};var fill=${FILL_SOURCE};var w=window.open(o+"/fill?v=${BOOKMARK_VERSION}&o="+encodeURIComponent(location.origin)+"&h="+encodeURIComponent(location.hostname),"jobpipe_fill","width=440,height=620");function h(e){if(e.origin!==o||!e.data||e.data.type!=="jobpipe-fill")return;window.removeEventListener("message",h);Promise.resolve(fill(e.data.answers||[],e.data.files||[])).then(function(r){try{e.source.postMessage({type:"jobpipe-filled",filled:r.filled,attached:r.attached,left:r.left||[],optionalLeft:r.optionalLeft||0},o)}catch(x){}})}window.addEventListener("message",h);if(!w){var n=document.createElement("div");n.textContent="Allow pop-ups for this site, then click the JobPipe bookmark again.";n.setAttribute("style","position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:12px 14px;border-radius:12px;background:#0b0b0f;color:#f4f4f5;font:14px system-ui");document.body.appendChild(n);setTimeout(function(){n.remove()},9000)}})();void 0`;
  return `javascript:${encodeURIComponent(src)}`;
}
