---
name: add-partner
description: Give a group of people free JobPipe time through a partner deal (like SaasPire), send them a personal welcome email credited to the partner, and check later who signed up. Use when the owner says a partner, program, bootcamp or mentor is sending people, or asks "have the partner people signed up?".
---

# Add people from a partner deal

The owner talks in plain words (see her global CLAUDE.md). One question at a time. Show every email before it goes out. Nothing is sent until she says so.

## What already exists (don't rebuild it)

- `partnerGrants` table + `access:grantPartner` (convex/access.ts): stores a grant per email. If the person has an account it applies now; otherwise it applies the moment they join. Sets `paidUntil`, lets them in, records `partner` for the Billing page ("In partnership with X" + link). Running twice doesn't double up.
- On a new grant it queues the partner welcome email now, and a "your account is waiting" reminder 3 days later if they still haven't signed up.
- They do NOT get the usual "you're in" welcome or any free-trial emails (trial emails skip anyone with `paidUntil` in the future).
- They DO get job alerts for their roles, setup nudges, weekly summary, day-21 questions.
- `access:partnerStatus` shows, per person: welcome sent, reminder sent, signed up, setup done.
- Email text: `partnerWelcomeEmail` and `partnerReminderEmail` in convex/lib/email.ts.

## Steps

1. **Collect, one question at a time:** partner name and website; each person's sign-up email and first name (guess first names from emails, ask her to confirm); how long (default 3 months) and the start date (default today).
2. **Read the partner's website** so the email speaks to what their people just learned.
3. **Check the welcome email text fits this partner.** It was written for SaasPire (SDR/BDR, "you've spent the last few weeks learning how to prospect", "Go get picked" is SaasPire's own line). For a different partner, rewrite those parts. If partners need different wording, add an optional message field to the grant rather than hardcoding a second email. Show her the full email with a real first name filled in. Her rules so far: personal and warm, opens with why we partnered, no end date in the email, no roles the program doesn't train for, ends "All the best for the hunt".
4. **Ship any code change:** tests (`npx vitest run`), `npx tsc --noEmit -p .`, commit, push to main, then ask her to run `! npx convex deploy -y` (Claude can't deploy to prod).
5. **Work out the dates** in milliseconds, India time: start of the first day, end of the last day, e.g.
   `node -e 'console.log(Date.parse("2026-11-10T00:00:00+05:30"), Date.parse("2027-02-10T23:59:59+05:30"))'`
6. **Give her the command to run** (it sends emails straight away, so say so plainly):
   ```
   ! npx convex run --prod access:grantPartner '{"people":[{"email":"a@x.com","firstName":"A"}],"name":"<Partner>","url":"<https://partner-site>","from":<ms>,"until":<ms>}'
   ```
   "applied" = had an account, switched on now. "waiting for sign-up" = switches on when they join.
7. **Save it:** update or add a memory note for the partner (people, dates, wording agreed), linked from MEMORY.md.

## Checking on them later

Ask her to run (Claude can't read prod data):
```
! npx convex run --prod access:partnerStatus '{"name":"<Partner>"}'
```
Then tell her who hasn't signed up or finished setup, and offer to draft a personal note for those people.
