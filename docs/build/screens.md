# Screens → routes (desk = desktop/iPad, phone = tech/client)

Each route matches a board artboard. Build the clean screen; the annotated frames (codes) are its behaviour spec. Source: `design/<folder>/`.

| Route | Who | Board · artboard | Frames (spec) | Milestone |
|---|---|---|---|---|
| `/kit` | dev | Design System | all components | M0 |
| `/setup/*` | owner | Onboarding · Main, Info, Services, Staff, Payments, Hardware, Clients, Test | Svc1–6, Stf1–6, Pay1–4 | M1, M4 |
| `/join/[invite]` | staff phone | Onboarding · StaffInvite | Sj01–Sj10 | M2 |
| `/clock` | staff | Onboarding · StaffClockIn | Sj11–Sj12 | M2 |
| `/me` | everyone | Profile, PIN + Settings https://claude.ai/artifact/MPFxacr8DDViQs9NtJBvhf · 4.1–4.2 (+ bottom-left pop-up on every desk screen) | — | built Nov 17 |
| `/desk` (= `/today`) | salon device | Profile, PIN + Settings https://claude.ai/artifact/MPFxacr8DDViQs9NtJBvhf · 2.1–2.3 (faces screen, lock, manager PIN) | — | built Nov 17 |
| `/clock` | any staff, by PIN on a time clock tablet | Profile, PIN + Settings https://claude.ai/artifact/MPFxacr8DDViQs9NtJBvhf · 3.1 | — | built Nov 17 |
| `/settings/team` · `/settings/pin` · `/settings/pin-activity` · `/settings/devices` | owner, manager (on a salon device: their PIN) | Profile, PIN + Settings https://claude.ai/artifact/MPFxacr8DDViQs9NtJBvhf · 5.1–5.4 | — | built Nov 17; Team drawer PIN box (Nov 20): Make a new PIN now / PIN link, see `docs/pin-help.md` |
| `/t/pin?c=<code>` · `/t/pin?s=<salon>` | the person the link is for (own phone) · any staff changing their own PIN | PIN help, `docs/pin-help.md` | — | built Nov 20 |
| `/checkout/[ticket]` | front desk | Checkout · Main, Pay, Reader, Cash, Done | Tk1–Tk7, Rd1–Rd4, Cs1–Cs2, An1–An6 | M3–M5 |
| `/gift-cards` · `/gift-cards/codes` | owner | Loyalty + Gift Cards · GiftSetup, GiftList | G1–G2, G10–G12, G18–G19 | M5 |
| checkout gift drawer | front desk | GiftSell, GiftUse | G3–G5, G7–G9, G17 | M5 |
| `/clients` · `/clients/[id]` | desk, owner | Main Screens · Clients; Client History · Client | C1–C2, H1–H2 | M6 |
| `/calendar?view=day|week|month` | desk | Booking · Cal, CalWeek, CalMonth | D1–D13, W1–W2, M1–M2 | M7 |
| `/calendar` (phone) | desk/owner phone | Booking · CalPhone | G1–G7 (gestures) | M7 |
| `/book/[salon]` | client | Booking · BookWeb, BookPhone | Wb1–Wb8, C1–C8 | M8 |
| `/kiosk` | client (iPad) | Booking · Kiosk | K1–K4 | M8 |
| `/settings/booking-page` | owner | Booking · PageSettings | P1–P3 | M8 |
| `/today` | owner, desk | Main Screens · Main | H1–H2 | M11 |
| `/numbers` | owner, manager | Owner Numbers · Main | K1–K2 | M11 |
| `/close-day` | owner, manager (front desk can start) | Main Screens · CloseDay | Z1–Z5 | M10 |
| `/payouts` | owner, manager | PRD payout sheet (issue #15) | — | M10 |
| `/earnings` | any staff, by PIN on the salon device | Main Screens · Profile "My earnings" | P4–P5 | M10 |
| `/loyalty` | owner | Loyalty + Gift Cards · Loyalty | L1–L6 | M12 |
| checkout loyalty panel | front desk | LoyaltyPay, LoyaltyPack | L7–L9 | M12 |
| `/c/[salon]` (client page) | client phone | LoyaltyPhone, ClientCards, GiftPhone | L10, G6, G13–G16 | M12 |
| `/t` (tech app) | tech phone | Tech App · Tech; Booking · StaffBook | T1–T4, S1–S7 | M13 |
| `/admin` | us (Oliver admin, Elang support) | Founder Admin · Admin, AdminPhone | A1–A8 | M14 |
