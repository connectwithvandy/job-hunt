# Status — beta launch prep (31 Oct 2026)

Everything below is pushed to main and deployed to Convex prod. Personal details (CV links, emails, tester names) are kept out of this file on purpose.

## Done
- **Domain: jobpipe.in.** DNS stays at the registrar so email keeps working: `A @ → 76.76.21.21` (Vercel), `CNAME www → jobpipe.in`. The old vercel.app address and www redirect to jobpipe.in (`next.config.ts`), except Google's ownership file. Convex `APP_URL=https://jobpipe.in`.
- **Support email: hello@jobpipe.in**, forwarded to the owner's Gmail under a JobPipe label. The mailbox is on a free trial that ends 1 Dec 2026.
- **Google:** Search Console owns jobpipe.in and the vercel.app address through `public/google1e06ebb533b6dcaa.html` (never delete it). The Google Cloud OAuth app has Gmail + Calendar read-only access, branding on jobpipe.in, and is in Testing mode with a few test users.
- **Connect Gmail button** (`convex/google.ts`): Google sign-in, refresh token stored encrypted, hourly sync (`crons.ts`), Disconnect. The Google Script stays as a fallback.
- **Beta readiness:** owner password reset on `/waitlist`; onboarding step 4 (form answers + autofill bookmark); failing job boards are named; in-app feedback (read on `/waitlist`); Google Jobs quota split per tester; Firecrawl fallback (off until `FIRECRAWL_API_KEY`); first-hour bugs fixed; tests (`npm test`).
- **Job matching:** users in an Indian city only see that city, anywhere-in-India, or India/APAC remote roles; postings over 30 days old skip Today; engineering, product, technical and presales titles never match sales roles.
- **Waitlist** asks name, LinkedIn and target role; the owner sees them on `/waitlist`.
- **Privacy page** covers Connect Gmail and Google's Limited Use rules.

## To do (owner)
1. **1 Nov, after 13:30 IST:** Google Cloud → Branding → "I have fixed the issues" → Proceed, then Audience → Publish app.
2. Hand the Google Cloud project and Search Console over to hello@jobpipe.in (add as Owner, accept, then remove the personal account).
3. Gmail "Send mail as" hello@jobpipe.in (`smtp.hostinger.com`, port 465, SSL).
4. Owner name in `src/lib/legal.ts` (privacy page still shows "[to be added]").
5. Decide on the mailbox trial before 1 Dec; add a Firecrawl key; set an Anthropic spend cap; check Convex usage before testers join.
6. Try Connect Gmail as a test user and confirm a recruiter reply reaches Today.
