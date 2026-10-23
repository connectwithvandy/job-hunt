# Job Hunt

A job search app for people playing more than one game at once.

Most job tools assume one person, one CV, one target. Real searches aren't like that: you might go after Sales Development leadership, GTM Strategy and Account Executive roles in the same month, each pitched differently. Job Hunt gives every one of those a **track** with its own CV angle and outreach voice, scores every job against all of them, and tells you which game is actually getting replies.

It runs on your laptop. Your CV, jobs and LinkedIn connections stay in a `data/` folder on your machine.

## What it does

- **Finds jobs** from [Dreamwork](https://www.dreamworkhq.com)'s public index, per track, or from any link or pasted description.
- **Scores fit per track**, with a reason and the gaps, so a misleading title doesn't waste your evening.
- **Tailors your CV and cover letter** for each job in your own CV design, reordering and trimming your master CV. A fact check flags any number that isn't in your master CV.
- **Finds who you know there** from your LinkedIn connections, picks the one or two best people to ask, and drafts a personal referral note for each. You press Send yourself: nothing is automated on LinkedIn, so your account stays safe.
- **Tracks everything**: applications on a board, referral asks with nudges after five days, and reply rates per track on the home screen.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer, and either a Claude subscription with [Claude Code](https://claude.com/claude-code) installed, or an Anthropic API key.

```bash
git clone https://github.com/connectwithvandy/job-hunt
cd job-hunt
npm install
npm run dev
```

Open http://127.0.0.1:3000 and follow the three setup steps on the home screen.

**AI.** With Claude Code installed and signed in, the app uses your subscription. To use an API key instead, create `.env.local` with `ANTHROPIC_API_KEY=...`. The model defaults to Claude Opus 5.5; set `JOBHUNT_MODEL` to change it.

**Your data.** Everything lives in `data/` (ignored by git in this repo). Back it up by making `data/` its own private git repo, then run `npm run backup` whenever you like. To keep it somewhere else, set `JOBHUNT_DATA_DIR`.

**Your CV design.** `src/components/ResumeDoc.tsx` and the `.resume` styles in `src/app/globals.css` draw the CV. Change them to match your own design.

## Not built yet

Interview prep, Gmail reading to move applications along automatically, and calibrating scores from your results.

## Credits

Ideas borrowed from [career-ops](https://github.com/career-ops-hq/career-ops) (the fact check), [job-ops](https://github.com/DaKheera47/job-ops) (a score with a reason) and [ai-job-search](https://github.com/ai-job-search-dev/ai-job-search). No code was copied.
