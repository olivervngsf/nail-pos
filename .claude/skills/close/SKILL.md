---
name: close
description: >-
  Close out a thread before archiving it. `/close` = summary of THIS thread
  (what happened, asked, decided, built, loose ends, waiting on Oliver, safe to
  archive?), logs it in the Build Tracker, then asks to archive. `/close all` =
  one row per recent thread (last 7 days) with a one-line "what happened", PR and
  state, then archive the ones picked. Use when the user says "/close", "close
  this thread", "what did we do here", "summarize this thread", "can I archive
  this", or "what were my threads about".
argument-hint: "[all | <days>]  (blank = this thread only)"
---

# close

Why: Oliver often can't remember what a thread was about. Before archiving, he
wants a 10-second answer: what happened here, and is it safe to let go?

What the user typed after `/close`: `$ARGUMENTS`.
- blank → **This thread** (below).
- `all` → **All threads**, last 7 days.
- a number (e.g. `14`) → **All threads**, last that many days.

Style (always): plain words, short bullets, no code talk, links as markdown
links with full URLs. Same layout every time so it's quick to scan.

---

## This thread

### 1. Gather (quietly, in parallel)
- The conversation itself: first ask, changes of direction, decisions, dead ends.
- `git status -sb`, `git log --oneline origin/main..HEAD`, `git diff --stat origin/main...HEAD`
  → is anything not committed or not pushed?
- This branch's PR: `gh api "repos/olivervngsf/nail-pos/pulls?head=olivervngsf:<branch>&state=all"`
  → number, link, draft/open/merged/closed. If open: check runs on its head
  sha (`gh api repos/olivervngsf/nail-pos/commits/<sha>/check-runs`) → green / failing / running.
- New files in `supabase/migrations/` on this branch → applied to test? on live
  yet (only after merge + "Live database" run is green)?
- Build Tracker doc (Claude Docs, id `2a44ea76-125f-483a-bd07-2d4ad141de29`):
  read the "Session log" tab's newest rows + "Waiting on Oliver", so you don't
  log twice.

### 2. Show the summary (this exact layout)

```
## Close: <short topic, 3–6 words>

**What happened**
<3–5 lines, in order: started with → tried → dropped (and why) → landed>

- **Asked:** <one line>
- **Decided:** <bullets, or "nothing">
- **Built:** <what changed, in plain words> · PR <link> (<draft / open / merged>, checks <green / failing / running>)
- **Loose ends:** <not pushed, PR not merged, checks failing, migration not on live, half-done step… or "none">
- **Waiting on Oliver:** <clicks only he can do (Vercel, Apple, Stripe, Twilio…), or "nothing">

**Safe to archive?** ✅ Yes / ⚠️ Not yet: <the reason>
```

Rules for "Safe to archive?":
- ⚠️ if anything is not committed or not pushed (work would be lost with the container).
- ⚠️ if a background job / agent from this thread is still running.
- ⚠️ if the PR has failing checks or a review comment not answered.
- An open PR with green checks is ✅ (the PR keeps the work; note "PR still open").
- Only talk, no build → ✅ unless a decision still waits on him.

### 3. Log it (no need to ask)
In the Build Tracker doc (Claude Docs connector):
- "Session log" tab: add one row at the top: date · topic · discussed/decided · built · PR.
  Skip if the same topic + date is already there; update that row instead.
- "Waiting on Oliver": add the new items, tick the ones this thread finished.
- Build Tracker tab: move a feature's status if this thread changed it.
If the doc can't be reached, say so in one line and keep going.

### 4. Ask to archive
- ⚠️ → offer to fix the loose end first (push, wait for checks…). Don't archive.
- ✅ → ask: "Archive this thread now?" Only on a yes: `archive_session` with this
  session's id (`get_session` with no id gives it). Never archive without a yes.

---

## All threads

### 1. Gather
- `list_sessions` with `mine: true`, page until older than the day range.
  Skip archived threads and this one.
- Per thread: title, last update, `status_bucket`, and if needed `list_events`
  (kinds `user`, `assistant`, `result`) for a 1-line what-happened.
- PRs: `gh api "repos/olivervngsf/nail-pos/pulls?state=all&per_page=100"` → match
  by branch name / title.

### 2. Show the table

```
## Threads, last <n> days

| # | Thread | What happened | When | PR | State |
|---|--------|---------------|------|----|-------|
| 1 | <title> | <one line> | Nov 24 | <link> merged | ✅ done |
| 2 | … | … | … | <link> open, checks failing | ⚠️ loose end |
| 3 | … | … | … | none | 🔄 running |
```

States: ✅ done (nothing left) · ⚠️ loose end (say what, in the row) · 🔄 still running.
Worst first: 🔄, then ⚠️, then ✅.

Then: "Which ones should I archive? (numbers, or 'all ✅')"

### 3. Archive what was picked
- Archive only the numbers given. A 🔄 or ⚠️ one: say why once, archive only if he repeats.
- One line at the end: archived n threads, kept m.
- Log a single "Session log" row for this tidy-up only if something was decided.
