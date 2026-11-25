# Hardware shopping list (to test, not final)

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU) · [How Checkout Works](https://claude.ai/artifact/QghcRANKFnTg1u8hpuiSWg)

Checked Nov 16, 2026. Confirm the exact model number and seller before buying.

## Receipt printer (pick one to test; Wi-Fi works with our web app on every device)
- Epson TM-m30III, white, Wi-Fi + Ethernet + USB: https://www.amazon.com/Epson-TM-M30III-Thermal-Receipt-Printer/dp/B0F3L2MM7Z
- Epson TM-m30III-H, Wi-Fi + Bluetooth (often out of stock): https://www.amazon.com/TM-m30III-H-C31CK51022-Receipt-Ethernet-Bluetooth/dp/B0C4HV69TJ
- Star TSP143IV, Ethernet/USB (wired to router): https://www.amazon.com/Star-Micronics-TSP143IV-TSP143III-Connectivity/dp/B0BJZVG1FD
- Star TSP143IV X4, Wi-Fi + Bluetooth: https://www.amazon.com/Star-Micronics-TSP143iV-Thermal-Receipt/dp/B0DYRRSJ86

## Cash drawer (plugs into the printer, RJ12; check voltage matches printer)
- Star Micronics 37965590, 16", printer driven: https://www.amazon.com/clp/B01FRC5X8E
- MMF PayVue 16", RJ12 24V: https://www.amazon.com/MMF-POS-Illuminated-16-2x16-4x4-3-225L1616104/dp/B07B7XZYNL
- Budget: SOLUX 16", RJ11/RJ12: https://www.amazon.com/clp/B00ZGO6UP4

## Card reader (NOT on Amazon: buy from the Stripe Dashboard → Terminal → Shop)
- WisePOS E: end of sale Sep 1, 2026 (Stripe docs). Don't plan on it.
- **V1 pick (Oliver, Nov 16): Stripe Reader S710**, current Wi-Fi smart reader, about $299 (per a Stripe partner help page). Works with a web app. One per salon at setup.
- **Ordered Nov 24, 2026:** 1 × S710 + 1 × S710 dock, $354.17 with tax + shipping, status Pending (Stripe → Terminal → Hardware orders). Receipts log: `docs/costs.md` § 8.
- Stripe M2 (Bluetooth, about $59): later, once our phone app ships.
- Tap to Pay: no hardware; needs our phone app.
