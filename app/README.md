# Nail POS web app (prototype)

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU)

A clickable prototype of the **core salon day**, with fake data:

1. **Staff (PIN)**: clock in / out (demo PINs: Lan 1111, Hoa 2222, Tuấn 3333, Vy 4444, Kim manager 9999). 3 wrong tries locks the pad.
2. **Check in**: client phone number → returning client card (visits, last service/tech, notes) or new client → services + add-ons → a tech or "next available".
3. **Turn list**: waiting clients + techs working with facts (turns, $ today, free / free at, skills, requests). Front desk taps a client, then picks the tech. Insight, not autopilot.
4. **Tech**: PIN → My client → Start → add add-ons → Done.
5. **Checkout** (client-facing, English): ticket → tip (15/20/25%, custom, cash, none) → card reader / cash with change / QR link → receipt (text, email, print, none) → thank you. Card fee shown; never taken from tips.
6. **My earnings**: PIN → today's tickets, commission, card vs cash tips, total, print, report a problem.

Vietnamese / English toggle on top. Orange bar shows when offline; everything saves on the device.

## Not real yet
- No Supabase (data lives in the browser's localStorage), no Stripe (payments are simulated), no texting, no printer.

## Run it
```bash
npm install
npm run dev
```
Open http://localhost:3000. Deploy on Vercel with root directory `app`.
