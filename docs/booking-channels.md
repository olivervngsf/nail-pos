# Booking — every way a client books (gap analysis + plan)

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU) · Board: [Booking Flow](https://claude.ai/artifact/VHeTS9Sd81pm1KbTNj9KUb)

Sources (Nov 16): Oliver's screenshots of Google Maps "Book online" → booking pages from ABC Salon System, Fresha, Vagaro, Setmore and others; a real salon menu. Booking pages themselves were not opened from here (they need a browser) — read from screenshots.

## 1. Where bookings come from (all land on ONE calendar)

| Channel | Who starts it | How it reaches us | In V1 design? |
|---|---|---|---|
| Google Maps / Search "Book online" | Client | Reserve with Google → our booking page | NEW — designed now (was V1.1, issue #18: decide) |
| Salon website / Instagram / Facebook "Book" button | Client | Link or button to our booking page | NEW — link + button code in Booking page settings |
| Text link (confirmation, reminder, "time for a fill") | Client | Same booking page, phone already known | Partly (C/R replies) → rebook link added |
| QR at the counter / on receipts | Client | Same booking page | Yes (calendar rail) |
| Phone call | Front desk | Calendar quick-book card | Yes |
| At the salon, next visit | Front desk / staff | "Book next visit" on Paid screen + calendar | Yes |
| Walk-in | Client at the door | Check-in iPad (kiosk) → waitlist → drag onto calendar | NEW — kiosk designed now |
| Group (bridal, friends, mom + daughter) | Client | Booking page "Group" (2–6 people) | NEW — designed now |

Every booking keeps its **source** (Google, website, Instagram, text link, QR, phone, walk-in, front desk) → owner sees where clients come from.

## 2. What the best booking pages do (from the screenshots)

- Salon header: name, logo, address, phone, hours per day, rating + review count, **photos** (salon + nail work).
- Two doors: **Book for me** / **Book a group**.
- Services: search, category chips (incl. **Combos** first), each with time + price; check circles to pick **several**; "Number of customers".
- **"Your visit" cart** beside the list: picked services, total time, total price, Continue (grey until something is picked).
- Staff per service with photo, or "Anyone"; then date + times; then name + phone; then done.
- Sign in / recognized returning client.

## 3. Gaps in our design (before this update)

| Gap | Fix |
|---|---|
| Only one service per booking | Multi-select + cart with total time / price |
| No combos / add-ons / "from" prices | Combos chip first; add-ons open under the picked service; "from $45" shown as such |
| No group booking | "Book a group": guests 2–6, each picks services + staff, times side by side |
| No salon photos, rating, hours, map | Salon header with owner photos, ★ rating from Google, hours, Directions |
| No owner control of the page | Booking page settings: upload photos, choose online services, rules, links |
| Google Maps not connected | "Connect Google" (Reserve with Google) in settings — decide V1 vs V1.1 |
| Walk-ins only typed by front desk | Check-in iPad at the door: phone → services → ticket # → waitlist + text when ready |
| Client can't show what they want | Optional inspiration photo upload when booking |
| Returning clients retype everything | Phone first → "Welcome back, Lan" + last service suggested |
| No source tracking | Source on every booking + "Where bookings come from" in settings |

## 4. Plan

1. Design (done in this pass, Booking board): booking web page (desktop + phone) with cart, combos, add-ons, staff, time, details + photo, done; group; salon header with photos; owner Booking page settings (photos, services online, rules, channels: Google, website button, Instagram link, QR); check-in iPad for walk-ins.
2. Decide with Elang: Reserve with Google in V1 or V1.1 (needs Google partner approval — long lead time; start the application early either way). Deposits / card on file: not V1.
3. Build order: booking page (single) → cart + combos/add-ons → returning client by phone → group → settings + photo upload → kiosk → Google.
4. Data: `bookings.source`, `booking_items` (one row per service per guest), `salon_photos`, `services.online_bookable`, `services.price_type` (fixed / from / add-on / package).

## 5. Open
- Reserve with Google: V1 or V1.1? (issue #18)
- How far ahead (proposal 30 days), buffer between bookings (proposal 0–15 min per service), last booking time before close.
- Group max (proposal 6), and whether a group needs the same start time.
- Photo moderation: owner only uploads; client inspiration photos stay private to the salon.
