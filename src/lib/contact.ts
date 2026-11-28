// Client phone + email on this device (Oliver, Nov 26): full for the owner's login only; everyone else gets them hidden
// from the server ("••7011", "mari•••@gmail.com"). A hidden value is shown as is, never formatted or sent as a number.
import { fmtPhone } from "@/lib/onboarding/data";

/** True for a value the server hid (contains •). */
export const isMasked = (v?: string | null) => !!v && v.includes("•");
/** Phone for the screen: hidden stays hidden, a full number gets (408) 555-0142. */
export const showPhone = (v?: string | null) => (!v ? "" : isMasked(v) ? v : fmtPhone(v));
