import Papa from "papaparse";
import { type ChatRow, nameKey, profileKey } from "../../convex/lib/chats";

/** "2024-05-06 10:22:10 UTC" as a timestamp, or NaN. */
function when(date: string) {
  return Date.parse(date.trim().replace(" UTC", "Z").replace(" ", "T"));
}

/** A profile link as a key; links without "/in/" are kept whole so chats still group by person. */
const key = (url: string) => profileKey(url) || url.trim().toLowerCase();

const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Rows of LinkedIn's messages.csv, and which profile is yours. */
function readMessages(text: string) {
  const { data } = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  if (!data.length || !("SENDER PROFILE URL" in data[0]) || !("CONTENT" in data[0])) {
    throw new Error("This doesn't look like LinkedIn's messages.csv. Its header should have \"SENDER PROFILE URL\" and \"CONTENT\".");
  }
  const rows = data
    .filter((r) => (r["IS MESSAGE DRAFT"] ?? "").toLowerCase() !== "yes" && (r["FOLDER"] ?? "").toUpperCase() !== "SPAM")
    .map((r) => ({
      from: key(r["SENDER PROFILE URL"] ?? ""),
      to: (r["RECIPIENT PROFILE URLS"] ?? "").split(/[,;\s]+/).map(key).filter(Boolean),
      fromName: (r["FROM"] ?? "").trim(),
      toName: (r["TO"] ?? "").trim(),
      at: when(r["DATE"] ?? ""),
      text: plain(r["CONTENT"] ?? ""),
    }))
    .filter((r) => r.from && r.to.length && r.text && !Number.isNaN(r.at));

  // You're in every chat, so your profile is the one that turns up most.
  const seen = new Map<string, number>();
  for (const r of rows) for (const k of new Set([r.from, ...r.to])) seen.set(k, (seen.get(k) ?? 0) + 1);
  const me = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!me) throw new Error("No one-to-one chats found in this file.");
  return { rows, me };
}

/**
 * Read LinkedIn's messages.csv (Get a copy of your data > Messages) into one short summary per person
 * you've had a one-to-one chat with. The full chats stay in the browser; only the summary and the
 * last few lines are sent to the app.
 */
export function parseMessagesCsv(text: string): ChatRow[] {
  const { rows, me } = readMessages(text);
  const people = new Map<string, ChatRow>();
  for (const r of rows.sort((a, b) => a.at - b.at)) {
    const others = [...new Set([r.from, ...r.to])].filter((k) => k !== me);
    // Group chats don't say how well you know any one person.
    if (others.length !== 1) continue;
    const [other] = others;
    const fromMe = r.from === me;
    const name = fromMe ? r.toName : r.fromName;
    const p = people.get(other) ?? { profileKey: other, nameKey: nameKey(name), name, messages: 0, fromMe: 0, firstAt: r.at, lastAt: r.at, recent: [] };
    p.messages++;
    if (fromMe) p.fromMe++;
    p.lastAt = r.at;
    p.recent = [...p.recent, { fromMe, at: r.at, text: r.text.slice(0, 300) }].slice(-4);
    people.set(other, p);
  }
  return [...people.values()];
}

/**
 * The longer one-to-one messages you wrote yourself, newest first, so letters and notes can sound like you.
 * Repeated templates (the same opening sent to many people) are skipped: they show a script, not your voice.
 */
export function myOwnMessages(text: string, max = 15): string[] {
  const { rows, me } = readMessages(text);
  const mine = rows.filter((r) => r.from === me && r.to.length === 1 && r.text.length >= 120).sort((a, b) => b.at - a.at);
  // The words after "Hi <name>", so the same message sent to many people counts as one template.
  const opening = (t: string) => t.toLowerCase().split(/\s+/).slice(2, 12).join(" ");
  const openings = new Map<string, number>();
  for (const r of mine) openings.set(opening(r.text), (openings.get(opening(r.text)) ?? 0) + 1);
  const picked: string[] = [];
  for (const r of mine) {
    if ((openings.get(opening(r.text)) ?? 0) > 1 || /https?:\/\//.test(r.text)) continue;
    picked.push(r.text.slice(0, 600));
    if (picked.length >= max) break;
  }
  return picked;
}

