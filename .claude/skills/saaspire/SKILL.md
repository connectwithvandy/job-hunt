---
name: saaspire
description: Add more people from SaasPire (Vijeth's B2C-to-SaaS-sales program, https://saaspire.co/) to JobPipe, or check how the SaasPire people are doing. Use when the owner mentions SaasPire, Vijeth, or a new batch of his candidates.
---

# SaasPire people

SaasPire is Vijeth's program that moves B2C sales reps into SaaS SDR roles. It focuses on prospecting (cold calls, cold email, LinkedIn outreach). Their line: "Stop applying. Start getting picked." This is a repeat partner, so the setup is already decided. Follow it unless the owner says otherwise.

The owner talks in plain words. One question at a time. Nothing is sent until she says so.

Deal terms, people already added, and what was agreed on price: read the memory notes `jobpipe-saaspire-partnership` and `jobpipe-vijeth-pilot` first. Never write candidates' emails or prices into this repo.

## Adding a new batch

1. **Ask for** each person's sign-up email. Guess first names from the emails and ask her to confirm them in one question.
2. **Ask** if it's the same deal: 3 months from today, every feature. Also ask if payment from Vijeth has arrived (it comes by payment link, not through the app).
3. **The welcome email is already written for SaasPire** (`partnerWelcomeEmail` in convex/lib/email.ts). She approved it on 10 Nov 2026. Don't change it unless she asks. Rules she set: warm, opens with why we partnered, prospecting angle ("your next role is the account"), SDR and BDR only (no AE), no end date, ends "All the best for the hunt. Go get picked." Offer to show it again if she wants to check it.
4. **Work out the dates** (India time, start of first day to end of last day):
   `node -e 'const s=new Date();s.setHours(0,0,0,0);const e=new Date(s);e.setMonth(e.getMonth()+3);e.setHours(23,59,59,0);console.log(s.getTime(),e.getTime())'`
   Check the printed dates make sense before using them.
5. **Give her the command.** Tell her plainly that it sends the welcome emails straight away:
   ```
   ! npx convex run --prod access:grantPartner '{"people":[{"email":"a@x.com","firstName":"A"}],"name":"SaasPire","url":"https://saaspire.co/","from":<ms>,"until":<ms>}'
   ```
   "applied" = had an account, switched on now. "waiting for sign-up" = switches on when they join. Their Billing page says "In partnership with SaasPire". They get a reminder after 3 days if they haven't signed up. They don't get the free-trial emails.
6. **Save it:** add the batch (emails, first names, dates) to the memory note `jobpipe-saaspire-partnership`, and set check-in dates: 3 days, 7 days, 21 days.

## Checking on them

Ask her to run (Claude can't read live data):
```
! npx convex run --prod access:partnerStatus '{"name":"SaasPire"}'
```
Tell her who hasn't signed up or finished setup. Offer to draft a short personal note to them, or a quick update for Vijeth on how his people are doing.

## Bigger batches

Vijeth may bring 50-80 people. Before agreeing a per-person price for a big batch, check what the pilot people actually cost to run (AI scoring and CV tailoring). See memory note `jobpipe-cost-first`.
