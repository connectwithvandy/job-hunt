---
name: daily-check
description: The daily JobPipe check-up - test every feature, fix bugs, read usage, and walk the app as a stranger to find what's hard to use or where people drop off. Use when the owner says "daily check", "test the platform", "is everything working", or asks how people are using it.
---

# Daily check-up

The owner talks in plain words (see her global CLAUDE.md). Tell her what you're about to do in one line, then work. End with ONE short report: what's broken, what you fixed, what needs her decision. Be honest about what you did NOT test.

Read `progress.md` (newest entry on top) first, so you don't redo yesterday or miss an open item.

## 1. Automated checks (run in the background while doing the rest)

```
npx vitest run; npx tsc --noEmit -p .; npx eslint .; npx next build
```
Any failure = bug to fix first.

## 2. Public site (no sign-in)

Fetch every URL in https://jobpipe.in/sitemap.xml plus `/ /pricing /about /contact /privacy /terms /refunds /cv-review /compare /resume /waitlist`, 12 at a time, and record status + time. Flag: anything not 200, anything slower than 5 seconds. Dead role pages in the sitemap and very slow role pages are known issues (see progress.md) — say if they got better or worse.

## 3. Live data (Claude can't read prod — ask her to run these, one block)

```
! npx convex run --prod alerts:report
```
- `summary` line: how many got the daily jobs email in the last day. Under half = the email broke; look at `whyNoEmail`.
- `searchProblems`: which job sources failed (Google Jobs "used up" is a known monthly limit).
- People with "hasn't finished setup" for 2+ days: candidates for a personal note.
- Partner people: `! npx convex run --prod access:partnerStatus '{"name":"SaasPire"}'` (any partner name).
Also ask her to glance at Admin → Errors and Admin → Overview (funnel: Let in → Set up → Searched → Scored → Tailored → Applied → Paid). Compare with the last numbers in progress.md. The biggest drop between two steps is the thing to improve.

## 3b. Search (every day: all growth is organic)

Google Search Console is connected in her Composio workspace (read-only). Pull the last 7 days and the 7 before, for `https://jobpipe.in/`:

```
composio execute GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY -d '{"site_url":"https://jobpipe.in/","start_date":"<7 days ago>","end_date":"<yesterday>","dimensions":["page","query"],"row_limit":200}'
```
(Search Console data lags ~2 days.) Report: clicks and impressions vs last week, non-brand clicks (not "jobpipe"/"job pipe").
Then fix ONE or TWO pages a day, the biggest chance first:
- Shown 50+ times at spot 1–10 but few clicks: rewrite `seoTitle` / `description` in src/lib/rolePages.ts (numbers and the words people searched, ~60 / ~155 characters).
- Spot 8–20 with impressions: add the searched question to that page's `faq` and a sentence to its intro.
- A query with impressions and no page for it: propose a new guide page (ask first).
Rules: no made-up numbers or job counts (only ranges already on the page or pay listed in postings); never name job sources/backend on public pages; bump GUIDES_UPDATED when guide text changes.
Also check sign-up sources (access.source: google, ai-search, linkedin-post) and /p page views in Vercel Analytics when she can share them.
Log in progress.md what changed on which page, so the next check can see whether clicks moved.

## 4. Walk the live app (her Chrome, signed in as owner)

Load the claude-in-chrome skill first. Open a new tab. Visit every page: Today, Jobs (search one role), a job page, Tracker, Companies, People/Network, Messages, Roles, Proof of work, CVs, Billing, Account, Admin (all tabs). For each: loads? console errors? anything internal, confusing, or broken? Don't trigger AI actions that cost money more than once a day (one score is fine; tailoring only if it changed).

## 5. Fresh-eyes walk (the third-person view)

Pretend you're a new SDR who just got the welcome email and has never seen JobPipe. On the DEV app (`npx convex dev` + `npm run dev`, new account like `uxtestN@example.com`) go from sign-up to a tailored CV, and at phone width (390px) too. At every screen ask:
- Do I know what to do next without thinking? Is the next button obvious?
- Is any word jargon or internal (source names, "tracks", "autopilot")?
- Does the setup guide pop-up show at the right moment, once, and point to the right next step? (src/components/SetupGuide.tsx, steps in convex/lib/guide.ts)
- Where would I give up? (long waits with no progress shown, empty pages, dead ends)
- What feature would I never discover? Is there a nudge (pop-up, email, empty-state hint) that leads me to it?
Write the top 3 friction points with the exact screen and a concrete fix.

## 6. Fix

- Small clear bugs (broken link, wrong word, crash): fix, test, commit, push to main. Backend change → ask her to run `! npx convex deploy -y` in the same message as the push.
- Anything that changes what users see in a big way, sends emails, or costs money: describe it in one line and ask first.

## 7. Save

Add a dated entry at the top of `progress.md` (it's gitignored, local only): numbers (let in, set up, tailored, applied, paid, daily email reach), what broke, what was fixed, what's still open. Keep it short.
