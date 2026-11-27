// @ts-nocheck
// Generated from the prototype's script (see journey.css). Call once after the markup is on the page.
export function runJourney(): () => void {
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // No motion: each beat gets a still copy of its card, and the last one gets the board.
    const faces = [...document.querySelectorAll("#obj .layer")], beatsR = [...document.querySelectorAll(".beat")];
    beatsR.forEach((bt, n) => {
      const src = n < 6 ? faces[n] : document.getElementById("board");
      const c = src.cloneNode(true);
      c.removeAttribute("id");
      c.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
      c.querySelectorAll(".slot").forEach((e) => e.classList.remove("slot"));
      c.style.width = c.style.height = c.style.transform = c.style.opacity = "";
      c.className = (n < 6 ? src.className + " still card" : "board still");
      const fg = c.querySelector(".ring .fg"); if (fg) fg.setAttribute("stroke-dashoffset", String(264 * .16));
      const rt = c.querySelector(".ring text"); if (rt) rt.textContent = "84";
      if (n === 2) c.querySelectorAll(".f-bullet").forEach((e) => e.classList.add("hl"));
      const txt = document.createElement("div"); txt.className = "stilltext";
      [...bt.children].forEach((ch) => txt.appendChild(ch)); bt.appendChild(txt);
      if (n === 6) { const bs = c.querySelectorAll(".lane > b"); bs[bs.length - 1].textContent = "1"; }
      const box = document.createElement("div"); box.className = "stillbox"; box.appendChild(c);
      bt.appendChild(box);
    });
    const w = document.getElementById("watch"); if (w) w.remove();
    return () => {};
  }

  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const px = (v) => Math.round(v * 2) / 2;
  const bez = (a, b, c, d, t) => { const m = 1 - t; return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d; };

  const NAMES = ["Prospect", "Qualified", "Proposal", "Sent", "Meeting", "Closed won", "Closed won"];
  const COUNTS = [[5, 1, 0], [5, 1, 0], [5, 1, 0], [6, 1, 0], [6, 2, 0], [6, 2, 1], [6, 2, 1]];
  // Face widths. Phones get their own narrower faces, so the text reflows instead of shrinking.
  const WIDE = { RW: 560, RH: 600, W: [470, 490, 430, 430, 480, 450], row: 400 };
  const NARROW = { RW: 380, RH: 0, W: [360, 360, 360, 360, 360, 360], row: 340 };
  const STATUS = 54, ROWS = 106, DECK = 4 * 48 + 8;

  const wordsEl = $(".words"), scene = $("#scene"), obj = $("#obj"), rig = $("#rig"), rigbox = $("#rigbox"), track = $("#journey"), board = $("#board");
  const layers = $$(".layer", obj), beats = $$(".beat"), ghosts = $$(".ghost"), trav = $$(".trav", obj);
  const status = $("#status"), segs = $$("#bar i"), dot = $("#dot"), stageName = $("#stagename"), count = $("#count");
  const ringfg = $("#ringfg"), ringnum = $("#ringnum"), sig = $("#sig"), stamp = $("#stamp"), note = $("#note");
  const wonchip = $("#wonchip"), minif = $("#minif"), minin = $("#minin"), woncount = $("#woncount"), light = $("#light");
  const cal = $(".cal span"), tags = [$("#tag0"), $("#tag1")], statusline = $(".statusline");
  const sigLen = sig.getTotalLength(); sig.style.strokeDasharray = sigLen;

  let G = WIDE, SH = [], slots = {}, chip = null, mode = "";

  // Lay each face out at its width, read its natural height, and note where every travelling piece sits.
  function layout() {
    const phone = innerWidth <= 900;
    mode = phone ? "phone" : "wide";
    G = phone ? NARROW : WIDE;
    rig.classList.toggle("phone", phone);
    rig.style.width = G.RW + "px";
    board.style.width = G.RW + "px";
    const keepRig = rig.style.transform, keepObj = obj.style.transform;
    rig.style.transform = "none"; obj.style.transform = "none";
    layers.forEach((l) => { l.style.transform = "none"; l.style.height = "auto"; });
    SH = layers.map((l, n) => { l.style.width = G.W[n] + "px"; return { w: G.W[n], h: Math.ceil(l.offsetHeight) }; });
    SH[2].h = SH[3].h = Math.max(SH[2].h, SH[3].h) + (phone ? 0 : 0);
    layers.forEach((l, n) => (l.style.height = SH[n].h + "px"));
    slots = {};
    layers.forEach((l, n) => {
      const lr = l.getBoundingClientRect();
      $$(".slot", l).forEach((s) => {
        const r = s.getBoundingClientRect(), cs = getComputedStyle(s), fs = parseFloat(cs.fontSize);
        (slots[s.dataset.s] ??= {})[n] = { x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height, fs, lh: r.height / fs, fw: cs.fontWeight, ff: cs.fontFamily, ls: cs.letterSpacing, tt: cs.textTransform, color: s.closest(".f-role-sm, .f-sub, .f-role-cv") ? "var(--ink-2)" : "var(--ink)", hl: !!s.dataset.hl, dim: !!s.dataset.dim };
      });
    });
    // Where the won card sits on the finished board (board in its final place).
    board.style.transform = `translateY(${boardTop()}px)`;
    const rr = rig.getBoundingClientRect(), c = wonchip.getBoundingClientRect();
    chip = { x: c.left - rr.left, y: c.top - rr.top, w: c.width, h: c.height };
    // The small "Ledgerly · Signed" face is drawn large so that, scaled down with the card, it matches the chip.
    minin.style.width = chip.w + "px";
    rig.style.transform = keepRig; obj.style.transform = keepObj;
  }
  const boardTop = () => (mode === "phone" ? 0 : (WIDE.RH - board.offsetHeight) / 2);

  // Card top (in rig units) for each step, and the box of everything shown, for fitting on phones.
  const topOf = (n) => {
    if (mode === "phone") return n === 0 ? DECK : STATUS;
    return n === 0 ? 210 : Math.max(60, (G.RH - SH[n].h - 96) / 2 + 20);
  };
  const boxOf = (n) => {
    const t = topOf(n);
    return n === 0 ? { top: t - DECK, bottom: t + SH[0].h + 8 } : { top: t - STATUS, bottom: t + SH[n].h + ROWS };
  };

  let lastStep = -1, shown = [5, 1, 0], lastTags = ["", ""];
  const deckO = [.92, .75, .55, .4];
  const countText = (c) => `<span><b>${c[0]}</b>applied</span> · <span><b>${c[1]}</b>meetings</span>` + (c[2] ? ` · <span><b>${c[2]}</b>offer</span>` : "");
  function setTag(n, text, on) {
    if (lastTags[n] === text) return;
    lastTags[n] = text;
    tags[n].textContent = text; tags[n].classList.toggle("on", on);
    tags[n].animate([{ transform: "rotateX(90deg)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function frame() {
    if ((innerWidth <= 900 ? "phone" : "wide") !== mode) layout();
    const phone = mode === "phone";
    const RW = G.RW;

    const r = track.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - innerHeight)) * 6;
    const i = Math.min(5, Math.floor(p)), local = p - i;
    const hold = i === 0 ? .5 : .3;
    const t = ease(clamp((local - hold) / (.9 - hold)));
    const th = ease(clamp((local - hold - .06) / (.9 - hold)));
    const u = clamp((local - .1) / .85);
    // Finale: shrink (A), slide down to the Closed won row (C), then the board appears around it (B).
    const fFade = smooth(0, .2, u), fA = smooth(.12, .42, u), fC = smooth(.44, .68, u), fB = smooth(.64, .86, u);
    const fin = i === 5;
    const q = i + t;
    const step = Math.round(fin ? 5 + (u > .5 ? 1 : 0) : q);

    // Words first (phones size the stage from them).
    beats.forEach((bt, n) => {
      const d = (fin ? 5 + fB : q) - n;
      const op = 1 - smooth(.3, .5, Math.abs(d));
      bt.style.opacity = op.toFixed(3);
      bt.style.transform = phone ? `translateY(${(-d * 22).toFixed(1)}px)` : `translateY(calc(-50% + ${(-d * 28).toFixed(1)}px))`;
      bt.style.pointerEvents = op > .6 ? "auto" : "none";
      bt.inert = !(op > .6);
    });
    if (phone) {
      const hs = beats.map((bt) => bt.offsetHeight);
      const qq = fin ? 5 + fB : q, qa = Math.min(6, Math.floor(qq)), qb = Math.min(6, qa + 1);
      wordsEl.style.height = Math.round(lerp(hs[qa], hs[qb], smooth(.3, .7, qq - qa))) + "px";
    } else wordsEl.style.height = "";

    // The card.
    const A = SH[i], B = SH[Math.min(5, i + 1)];
    const cw = chip ? chip.w : 236, chh = chip ? chip.h : 46;
    const w = Math.round(fin ? lerp(A.w, cw, fA) : lerp(A.w, B.w, t)), h = Math.round(fin ? lerp(A.h, chh, fA) : lerp(A.h, B.h, th));
    const top = fin ? topOf(5) + (SH[5].h - h) / 2 : lerp(topOf(i), topOf(i + 1), t);
    let cx = RW / 2, cy = top + h / 2, s = 1, objOp = 1;
    if (fin && chip) {
      // Shrink in place, then travel down the open right side of the board and into Closed won.
      const x0 = RW / 2, y0 = top + h / 2, x3 = chip.x + chip.w / 2, y3 = chip.y + chip.h / 2;
      cx = bez(x0, x0, x3, x3, fC); cy = bez(y0, y0 + 20, y3, y3, fC) + Math.sin(clamp((fC - .8) / .2) * Math.PI) * -3;
      objOp = 1 - smooth(.9, .96, u);
    }
    const knock = Math.max(0, 1 - Math.abs(q - 2.8) * 9) * 3;
    const tilt = (fin ? Math.sin(fC * Math.PI) * 2 : Math.sin(t * Math.PI) * (i % 2 ? -1.4 : 1.4)) + (q < .6 ? -1.5 * (1 - q / .6) : 0);
    obj.style.setProperty("--lift", fin ? (1 - fA).toFixed(3) : Math.min(1, .3 + q * .15).toFixed(3));
    obj.style.width = w + "px"; obj.style.height = h + "px";
    obj.style.transform = `translate(${px(cx - w / 2)}px, ${px(cy - h / 2 + knock)}px) rotate(${tilt.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    obj.style.opacity = objOp.toFixed(3);
    obj.style.borderRadius = (fin ? lerp(18, 10, fA) : q >= 1.5 && q <= 3.5 ? 8 : 18) + "px";
    minif.style.opacity = fin ? smooth(.85, 1, fA).toFixed(3) : 0;

    // Faces: the old one lifts away, then the new one settles.
    layers.forEach((l, n) => {
      const d = n === 5 ? Math.min(0, q - 5) : q - n;
      let fade = smooth(.08, .42, Math.abs(d));
      if (n === 5 && fin) fade = fFade;
      l.style.opacity = (1 - fade).toFixed(3);
      l.style.transform = fade > .001 && !fin ? `translateY(${(-Math.sign(d) * fade * 8).toFixed(1)}px)` : "none";
    });

    // Travelling pieces.
    const a = i, b = Math.min(5, i + 1);
    trav.forEach((el) => {
      const S = slots[el.dataset.k] || {};
      if (fin) { el.style.opacity = S[5] ? (1 - fFade).toFixed(3) : 0; return; }
      const sa = S[a], sb = S[b];
      let op, from = sa, to = sb, tt = t;
      if (sa && sb) op = lerp(sa.dim ? .38 : 1, sb.dim ? .38 : 1, t);
      else if (sa) { to = sa; tt = 0; op = (sa.dim ? .38 : 1) * (1 - smooth(.05, .4, t)); }
      else if (sb) { from = sb; tt = 1; op = (sb.dim ? .38 : 1) * smooth(.6, .95, t); }
      else { el.style.opacity = 0; return; }
      const x = lerp(from.x, to.x, tt), y = lerp(from.y, to.y, tt), cur = tt < .5 ? from : to;
      if (el.dataset.k === "mark") {
        const size = lerp(from.w, to.w, tt);
        el.style.width = el.style.height = size + "px"; el.style.fontSize = size * .45 + "px"; el.style.borderRadius = size * .26 + "px";
        el.style.transform = `translate(${px(x)}px, ${px(y)}px)`;
      } else {
        const base = Math.max(from.fs, to.fs), fs = lerp(from.fs, to.fs, tt);
        el.style.fontSize = base + "px"; el.style.lineHeight = (cur.lh * base) + "px";
        el.style.fontFamily = cur.ff; el.style.fontWeight = cur.fw; el.style.letterSpacing = cur.ls; el.style.textTransform = cur.tt; el.style.color = cur.color;
        const sc = fs / base;
        el.style.transform = `translate(${px(x)}px, ${px(y)}px)` + (Math.abs(sc - 1) > .001 ? ` scale(${sc.toFixed(4)})` : "");
      }
      el.style.opacity = op.toFixed(3);
      if (el.classList.contains("hlable")) {
        let hl = 0;
        if (sb && sb.hl) hl = smooth(.72, 1, t) * (el.dataset.k === "c2" ? smooth(.8, 1, t) : 1);
        else if (sa && sa.hl) hl = 1 - smooth(0, .35, t);
        el.style.backgroundSize = (hl * 100).toFixed(1) + "% 100%";
        if (hl > .5) el.style.color = "var(--hl-ink)";
      }
    });

    // Moments on the faces.
    const fit = clamp(1 - Math.abs(q - 1) * 2.2);
    ringfg.style.strokeDashoffset = (264 - 264 * .84 * smooth(0, 1, fit * 1.4)).toFixed(1);
    ringnum.textContent = Math.round(84 * smooth(0, 1, fit * 1.4));
    const sent = clamp(1 - Math.abs(q - 3) * 2.4);
    stamp.style.transform = `rotate(-9deg) scale(${lerp(1.8, 1, smooth(.2, .7, sent)).toFixed(3)})`; stamp.style.opacity = smooth(.2, .6, sent).toFixed(3);
    note.style.transform = `translateY(${lerp(26, 0, smooth(.4, .9, sent)).toFixed(1)}px)`; note.style.opacity = smooth(.4, .9, sent).toFixed(3);
    const meet = clamp(1 - Math.abs(q - 4) * 2.4);
    cal.style.transform = `rotateX(${lerp(-90, 0, smooth(.3, .8, meet)).toFixed(1)}deg)`;
    sig.style.strokeDashoffset = (sigLen * (1 - smooth(4.45, 4.95, q))).toFixed(1);

    // Other jobs.
    const cardBottom = top + h;
    ghosts.forEach((g, n) => {
      const gw = G.row - n * 12;
      const deckY = topOf(0) - 48 * (n + 1);
      const dO = deckO[n];
      const underY = cardBottom + 10 + n * 48;
      let gy, go;
      if (n >= 2) { const leave = smooth(.3, .5, q); gy = deckY - leave * 40; go = dO * (1 - leave); }
      else if (q < 1 && !fin) { const tuck = smooth(.5, .82, q); gy = lerp(deckY, underY, tuck); go = lerp(dO, [.95, .8][n], tuck) * (1 - Math.sin(tuck * Math.PI) * .75); }
      else { gy = underY; go = [.95, .8][n] * (fin ? 1 - fFade : 1); }
      g.style.width = gw + "px"; g.style.zIndex = 2 - n;
      g.style.transform = `translate(${px(RW / 2 - gw / 2)}px, ${px(gy)}px)`;
      g.style.opacity = go.toFixed(3);
    });
    setTag(0, q >= 2.6 ? "Applied" : "Scored", q >= 2.6);
    setTag(1, q >= 3.6 ? "Follow-up Thu" : "Scored", q >= 3.6);

    // Desk light and board.
    const stX = (Math.min(5, q) + .5) / 6;
    const lx = fin ? clamp(cx, 230, RW - 230) : clamp(RW * stX, 230, RW - 230);
    const ls = fin ? lerp(1, .56, fA) : 1;
    light.style.transform = `translate(${px(lx - 230)}px, ${px(cy - 230)}px) scale(${ls.toFixed(3)})`;
    light.style.setProperty("--k", (fin ? lerp(1, .5, fA) * (1 - fB) : 1).toFixed(3));
    board.style.opacity = (fin ? Math.max(smooth(0, 1, fC) * .45, fB) : 0).toFixed(3);
    board.style.setProperty("--cards", (fin ? fB : 0).toFixed(3));
    board.style.setProperty("--slot", (fin ? smooth(0, 1, fC) * (1 - smooth(.9, .96, u)) : 0).toFixed(3));
    board.style.transform = `translateY(${(boardTop() + lerp(10, 0, fin ? fB : 0)).toFixed(1)}px)`;
    wonchip.style.opacity = (fin ? smooth(.9, .96, u) : 0).toFixed(3);
    woncount.textContent = fin && u > .93 ? "1" : "0";

    // Fit the rig to the stage.
    const sw = scene.clientWidth, shH = scene.clientHeight;
    let k, ox, oy;
    if (phone) {
      const bxA = boxOf(i), bxB = boxOf(Math.min(5, i + 1));
      let bTop = lerp(bxA.top, bxB.top, t), bBot = lerp(bxA.bottom, bxB.bottom, t);
      if (fin) { const bh = board.offsetHeight; bTop = lerp(boxOf(5).top, 0, Math.max(fC, fB)); bBot = lerp(boxOf(5).bottom, bh, Math.max(fC, fB)); }
      const room = innerHeight - 68 - wordsEl.offsetHeight - 40;
      k = Math.min(1, (sw - 4) / RW, room / (bBot - bTop));
      ox = (sw - RW * k) / 2; oy = -bTop * k;
      rigbox.style.width = sw + "px"; rigbox.style.height = Math.round((bBot - bTop) * k) + "px";
      rig.style.transform = `translate(${px(ox)}px, ${px(oy)}px) scale(${k.toFixed(4)})`;
    } else {
      k = Math.min(1, (shH - 10) / G.RH); ox = 0; oy = 0;
      rigbox.style.width = RW * k + "px"; rigbox.style.height = G.RH * k + "px";
      rig.style.transform = k === 1 ? "none" : `scale(${k})`;
    }

    // Status above the card.
    const cardTopY = fin ? topOf(5) : top;
    const sW = Math.min(sw, Math.max(280, (fin ? SH[5].w : w) * k));
    status.style.width = sW + "px";
    status.style.transform = `translate(${px(rigbox.offsetLeft + ox + (RW / 2) * k - sW / 2)}px, ${px(rigbox.offsetTop + oy + cardTopY * k - 50)}px)`;
    status.style.opacity = (smooth(.5, .8, q) * (fin ? 1 - fFade : 1)).toFixed(3);
    statusline.classList.toggle("full", COUNTS[Math.min(6, step)][2] > 0);
    const st = Math.min(5, step);
    segs.forEach((sg, n) => { sg.classList.toggle("done", n < st || st === 5); sg.classList.toggle("now", n === st && st < 5); });
    dot.style.left = ((st + .5) / 6 * 100) + "%";
    dot.style.background = st === 5 ? "var(--ink)" : "var(--lime)";
    if (step !== lastStep) {
      lastStep = step;
      stageName.textContent = NAMES[Math.min(6, step)];
      const c = COUNTS[Math.min(6, step)];
      count.innerHTML = countText(c);
      $$("b", count).forEach((bEl, n) => {
        if (c[n] !== shown[n]) { bEl.classList.add("bump"); bEl.animate([{ transform: "translateY(-8px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }); setTimeout(() => bEl.classList.remove("bump"), 900); }
      });
      shown = c.slice();
    }
  }

  // Idle: while the opening screen sits still, new jobs arrive at the top of the pile, one way, three times.
  const ARRIVALS = [["H", "Head of Sales Dev", "62", "7:52"], ["E", "Enterprise AE", "74", "8:05"], ["S", "SDR Lead", "58", "8:21"]];
  let arrived = 0;
  function fill(g, [m, title, sc, time], isNew) {
    g.querySelector(".mk").textContent = m;
    g.querySelector(".gt").innerHTML = `${title} <i>· ${sc}</i>`;
    const tg = g.querySelector(".tag"); tg.textContent = isNew ? `New · ${time}` : "Scored"; tg.classList.toggle("new", isNew); tg.classList.remove("on");
  }
  const idle = setInterval(() => {
    if (document.hidden || scrollY > 4) return;
    if (arrived >= ARRIVALS.length) return clearInterval(idle);
    const top = ghosts[3], second = ghosts[2];
    const out = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px)" }];
    const inn = [{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }];
    [...top.children, ...second.children].forEach((ch) => ch.animate(out, { duration: 220, easing: "ease-in", fill: "forwards" }));
    setTimeout(() => {
      if (arrived > 0) fill(second, ARRIVALS[arrived - 1], false); // the last arrival moves down a row
      fill(top, ARRIVALS[arrived], true);
      deckO[3] = 1; deckO[2] = arrived > 0 ? .75 : deckO[2];
      if (arrived > 0) second.querySelector(".tag").textContent = "Scored";
      arrived++;
      req();
      [...top.children, ...second.children].forEach((ch) => ch.animate(inn, { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }));
    }, 240);
  }, 5000);

  let ticking = false, alive = true;
  const req = () => { if (alive && !ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; frame(); }); } };
  addEventListener("scroll", req, { passive: true });
  const onResize = () => { layout(); frame(); };
  addEventListener("resize", onResize);
  document.getElementById("watch").addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: track.offsetTop + (track.offsetHeight - innerHeight) / 6, behavior: "smooth" }); });
  count.innerHTML = countText(COUNTS[0]);
  layout(); frame();
  (document.fonts?.ready ?? Promise.resolve()).then(() => { layout(); frame(); });
  return () => { alive = false; removeEventListener("scroll", req); removeEventListener("resize", onResize); clearInterval(idle); };

}
