# JobPipe

**Your job search, run like your sales pipeline.**

The job search built for sales people: SDRs, BDRs, Account Executives and sales leaders.

**Use it free at [jobpipe.in](https://jobpipe.in)**

![JobPipe: finds the roles, tailors your CV, gets you the intro](https://jobpipe.in/opengraph-image)

Generic job boards treat an SDR, an Enterprise AE and a VP of Sales the same. JobPipe doesn't. It runs your search the way you'd run a sales pipeline:

| Stage | What JobPipe does |
| --- | --- |
| **Prospecting** | Finds new sales roles every morning, straight from company careers pages |
| **Qualifying** | Scores each role against your CV, with the reason it fits and the gaps |
| **Outreach** | Tailors your CV and cover letter for the roles worth applying to, and drafts referral and hiring-manager notes |
| **Follow-up** | Tracks every application on a board and reminds you when to follow up |
| **Closing** | Spots interview invites in your inbox and helps you prepare |

## What's in this repo

The full JobPipe app, open source:

- **Careers page readers** for 16 hiring systems, so roles come from the employer, not a reseller.
- **Fit scoring** with a reason and the gaps, per role you're going after.
- **CV tailoring** that only uses what's in your CV: a fact check flags any number or claim that isn't there.
- **A pipeline tracker** with follow-up nudges, and inbox reading that moves applications along by themselves.
- **Public job pages**: every open sales role in India and remote gets a page, plus city and company pages ([example](https://jobpipe.in/sales-jobs/in/bengaluru)).
- **Free tools**, like the [sales OTE calculator](https://jobpipe.in/tools/ote-calculator).

## Run your own copy

You need [Node.js](https://nodejs.org) 22 or newer and an [Anthropic API key](https://console.anthropic.com).

```bash
git clone https://github.com/connectwithvandy/job-hunt
cd job-hunt
npm install
npx convex dev      # creates your own backend and keeps it in sync
npm run dev        # in a second terminal
```

Then set your API key on your backend and open http://localhost:3000:

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...
```

Everything else is optional and switches on when its setting is present (see `convex/convex.config.ts`): emails, payments, inbox reading, extra job searches. `SCHEDULED_OFF=1` turns off the costly scheduled jobs on a test copy.

## Contributing

Issues and pull requests are welcome, especially new careers page readers (`convex/lib/careers.ts`) and better fit scoring. Please open an issue first for anything big.

## Credits

Ideas borrowed from [career-ops](https://github.com/career-ops-hq/career-ops) (the fact check), [job-ops](https://github.com/DaKheera47/job-ops) (a score with a reason) and [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search). No code was copied.

## License

[AGPL-3.0](LICENSE). You can use, change and share JobPipe freely. If you run a changed version as a website, you must share your changes under the same license.

If JobPipe helps you, a ⭐ helps other sales people find it.
