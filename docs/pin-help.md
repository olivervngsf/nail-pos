# PIN help: the two ways to give someone a new PIN

Plain words, for salon owners and our own team. Set Nov 20. In the app: **Settings → Team → tap the person → PIN box** (just above Name).

## First: invite link vs PIN link
- **Invite link** (green box "Hasn't joined yet"): for someone the owner **added but who hasn't joined**. One link does everything: confirm phone, pick language, make PIN.
- **PIN box**: for someone who **already joined**. Use it when they forgot their PIN, the owner cleared it, or they quit joining halfway ("No PIN" filter on Team).

## The two ways (PIN box)

| | 1. Make a new PIN now | 2. Send their PIN link |
|---|---|---|
| When | They are **at the salon**, next to the owner | They are **not at the salon** |
| What happens | Owner taps the button, hands over the screen. They type a new PIN twice. | Owner taps **Copy link** (paste in a text or Zalo) or **Text the PIN link**. They open it on their phone, sign in with a code texted to **their own phone**, type a new PIN twice. |
| Time | ~10 seconds | ~1 minute |
| Needs | Nothing | Their phone. The link shows "For Tuan · Lotus Nails" and their phone's last 4 digits. |
| Safe because | Only they see the screen; the owner never sees the PIN | Only that person's phone can use it. Works **once**, ends after **7 days**, a new link ends the older one. A forwarded link is useless. |

**Best default: way 1** (fast, no texting). Way 2 only when they are away.

## Other PIN things
- **Change my own PIN** any time: techs = tech app → Me → **Change my PIN**; owner / manager / front desk = **My profile** → Change PIN.
- **Forgot PIN: clear it** (bottom of the drawer): only clears. Then use way 1 or 2.
- **Owner's own PIN:** only the owner can reset it (a manager can't).
- **PIN length:** 6 or 10 digits, set in Settings → PIN rules. Easy PINs (123456, 111111) are refused.
- Every PIN change and every PIN try is logged (Settings → PIN activity).

## Not the same as
- **2-step login code** (owners/managers, My profile → 2-step login): a 6-digit code from an app like Google Authenticator for signing in on their own phone. Not a PIN.
- **Text sign-in code**: the 6-digit code we text to sign in. Not a PIN.

## Today's limit
- "Text the PIN link" doesn't deliver until our texting registration is approved. Use **Copy link** until then.

## For builders
Code + database: `CLAUDE.md` § "PIN help". Drawer `src/app/settings/team/TeamPage.tsx`, link page `src/app/t/pin/PinLinkPage.tsx`, route `/api/pin/text`, DB `pin_links` + `pin_link_make` / `pin_link_get` / `pin_link_set` / `admin_set_pin` / `set_my_pin`, test `supabase/tests/pin_links.sql`.
