# Nail POS Design System (kit)

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU)

Live system (tokens, components, rules, previews): https://claude.ai/artifact/JynVCKHp6dmhoQThgASD5n
Golden screen: **Checkout · Ticket** (`design/checkout/Main.dc.html`).

| File | What | Rule |
|---|---|---|
| `kit.css` | Tokens + every component class (Inter font, buttons, chips, fields, switch, option rows, PIN keypad, cards, pills, drawer, sheet, toast, banner, motion) | The ONE source. Never redefine these in a screen |
| `tokens.json` | Same tokens as data (colors, type, spacing, radius, shadow, sizes) | For Tailwind / CSS vars in the app |
| `rail.py` | Left menu markup (Today, Calendar, Checkout, Clients, Close day + profile) | Same on every desktop screen; only active item changes |
| `annot.css` | Spec frames: `.af` 1640×800, `.afp` phone, `.afw` calendar, `.afk` kiosk; pins + notes toggle | Every screen gets one |
| `setup.css` | Setup wizard shell | Setup only |

Components (same names in the live system and later as React components): LeftMenu, TopBar, PhoneBar, PhoneTabs, SetupSteps, Button, Segmented, Chip, Field, Switch, Stepper, PinKeypad, ListGroup, Rows (xs/s/default/m/l), Card (+ .card.pad), StatusPill, Avatar, StatTile, ProgressBar, DataTable, MiniBars, DayTimeline, MessageBubble, Drawer, Sheet, Toast, Banner, Annotation.

**Font weight rule (Oliver, Nov 17):** semibold (600, `--fw-semibold`) is the default for emphasis: titles (`.h1`, `.h2`), names, buttons, `<b>`/`<strong>` (kit sets `b,strong{font-weight:600}`). Bold (700, `--fw-bold`, `.bold`) only on purpose: big money (`.money`), KPI numbers (`.stat .v`), totals on receipts/slips, codes (OTP). Never bold body text. Unsure → 600.

New screen: link `kit.css` (+ `annot.css`), menu from `rail.py`, use only kit classes; screen `<style>` = layout only.
Changing the look: edit `kit.css` here first, then the live system, then re-copy into each board.
