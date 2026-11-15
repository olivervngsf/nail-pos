# Tools reference list

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU) · [Running Costs](https://claude.ai/artifact/UioTSft9RRanZRPN9j7qom)

Status: **reference only, not officially selected** (added 2026-11-15).
"In stack" = already decided in CLAUDE.md / PRD. Everything else is an option to review.

| Area | Tool | What it's for | Status |
|---|---|---|---|
| Code | GitHub | Code + tasks | In stack |
| Backend | Supabase | Database, logins | In stack |
| Backend | Firebase | Backend infrastructure | Option (overlaps Supabase) |
| Backend | Node.js | Backend language | Option |
| Hosting | Vercel | Deploy the web app | In stack |
| Hosting | Cloudflare | Infrastructure (DNS, CDN, security) | Option |
| Hosting | AWS | Cloud, pay-as-you-go | Option |
| Web app | React | Web version | Option (fits Vercel) |
| iPhone app | Swift + UIKit | Native iOS app (Tap to Pay later) | Option |
| iPhone app | iCloud | Native app features | Option |
| iPhone app | Apple Developer | App distribution | Needed for iOS app ($99/yr) |
| Payments in app | Superwall | Paywall management | Option |
| Analytics | PostHog | Product analytics | Option |
| Analytics | Mixpanel | Product analytics | Option (overlaps PostHog) |
| Analytics | Datafa | Tracking | Option |
| Email | Loops | Email | Option |
| Domain | GoDaddy | Domain | Option |
| Design | Figma | Design | Option |
| AI coding | Claude | Coding agents | In use |
| AI coding | Codex | Coding agents | Option |
| AI coding | Cursor | AI code editor | Option |
| AI | OpenAI | Development | Option |

## Overlaps to decide later
- Backend: Supabase vs Firebase (pick one)
- Analytics: PostHog vs Mixpanel vs Datafa (pick one)
- Hosting extras: Cloudflare / AWS only if Vercel + Supabase aren't enough
- Superwall is built for app subscriptions; salons may be billed through Stripe instead
