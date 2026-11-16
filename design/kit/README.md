# UI kit — one look for every board

Back to: [Nail POS Hub](https://claude.ai/artifact/9HZ5deX1wVYaLzG895UciU)

Golden screen (the reference everything matches): **Checkout · Ticket** (`design/checkout/Main.dc.html`).

| Piece | Source of truth | Rule |
|---|---|---|
| Colors, type, spacing, buttons, pills, groups/rows, cards, tiles, chips, avatar, motion | `design/checkout/pos.css` (copied to every board) | Never redefine these per screen |
| Left menu (icons + labels: Today, Calendar, Checkout, Clients, Close day; profile avatar at bottom) | `design/kit/rail.py` | Same markup on every desktop screen; only the active item changes |
| Top bar | `.bar` in pos.css: title · status pill · person | 56 px |
| Annotated frames | `design/*/annot.css` (pins beside target, Hide/Show notes, no scrollbars) | Every screen gets one |
| Frame sizes | Desktop 1280×800 (calendar 1440×900) · phone 390×844 · iPad kiosk 1024×768 | |
| Wizard (setup) | `design/onboarding/setup.css` | Setup only |

Before a new screen: copy pos.css + annot.css, generate the menu from rail.py, compare to the golden screen. After a flow: run a consistency check (menu, bar, buttons, chips, spacing) across all boards.
