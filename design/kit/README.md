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

Components (same names in the live system and later as React components): LeftMenu, TopBar, PhoneBar, SetupSteps, Button, Segmented, Chip, Field, Switch, PinKeypad, ListGroup, Card, StatusPill, Avatar, Drawer, Sheet, Toast, Banner, Annotation.

New screen: link `kit.css` (+ `annot.css`), menu from `rail.py`, use only kit classes; screen `<style>` = layout only.
Changing the look: edit `kit.css` here first, then the live system, then re-copy into each board.
