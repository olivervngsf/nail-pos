# Test accounts (test project only)

PIN 123456 for everyone in the salon (test only; set Nov 18). To give someone a new PIN: `docs/pin-help.md`. The admin (…0009) has no salon, so no PIN.

Salon: **Lotus Test Nails** (`supabase/seed/test_salon.sql` + `test_salon_activity.sql`). Sign in at /login with the phone, code from Supabase Auth > Phone > Test Phone Numbers (no real text, $0).

| Phone | Who | Code | PIN |
|---|---|---|---|
| 555-010-0001 | Owner (Lan) | 123456 | 123456 |
| 555-010-0002 | Manager (Mai) | 123456 | 123456 |
| 555-010-0003 | Front desk (Hanh) | 123456 | 123456 |
| 555-010-0004 | Linh (tech) | 123456 | 123456 |
| 555-010-0005 | Kim (tech) | 123456 | 123456 |
| 555-010-0006 | Tuan (tech) | 123456 | 123456 |
| 555-010-0007 | Vy (tech, license expires soon) | 123456 | 123456 |
| 555-010-0008 | Thao (booth renter) | 123456 | 123456 |
| 555-010-0009 | Platform admin (no salon) | 123456 | – |

Gift cards: `LQTU-TEST-CARD-X25P` ($55 left), `LQTU-TEST-CARD-X99G` ($25), `LQTU-TEST-CARD-X55H` (used up).

Test codes expire Jan 31, 2027 (Supabase setting). Refresh the 3 weeks of history around today: re-run `supabase/seed/test_salon_activity.sql`.
