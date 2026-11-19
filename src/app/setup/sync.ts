"use client";
// Setup saves to the database through the offline queue: the whole wizard is sent each time (safe to repeat).
import { enqueue, registerHandler } from "@/lib/offline/outbox";
import { SMS_ON, e164, rpc } from "@/lib/auth";
import type { PayType } from "@/lib/onboarding/data";
import type { SetupState } from "./state";
import { textInvite } from "@/lib/texting/client";

const uuid = () => crypto.randomUUID();
// One new salon id per page load: several quick calls must not each make a different salon.
let minted: string | undefined;

/** Give the salon, services and staff stable ids (older saved wizards had none). */
export function withIds(s: SetupState): SetupState {
  const needs = !s.salonId || s.menu.some((m) => !m.id) || s.staff.some((p) => !p.id);
  if (!needs) return s;
  return {
    ...s,
    salonId: s.salonId || (minted ??= uuid()),
    menu: s.menu.map((m) => (m.id ? m : { ...m, id: uuid() })),
    staff: s.staff.map((p) => (p.id ? p : { ...p, id: uuid() })),
  };
}

const ROLE = { Owner: "owner", Manager: "manager", "Front desk": "front_desk", Tech: "tech" } as const;
function pay(p?: PayType) {
  if (p === "Commission 60%") return { payType: "commission", commissionPct: 60 };
  if (p === "Hourly $16") return { payType: "hourly", hourlyCents: 1600 };
  if (p === "Booth rent") return { payType: "booth_rent" };
  return {};
}

export function toPayload(s: SetupState) {
  return {
    salonId: s.salonId,
    ownerName: s.ownerName,
    salonName: s.salonName,
    salonPhone: s.salonPhone ? e164(s.salonPhone) : "",
    address: s.address,
    state: s.state,
    step: s.step,
    hours: s.hours.map((h) => ({ on: h.on, open: h.open, close: h.close })),
    services: s.svcStage === "review" || s.step > 1 ? s.menu.map((m) => ({ id: m.id, cat: m.cat, name: m.name.trim(), minutes: m.minutes, priceCents: m.priceCents, priceFrom: !!m.priceFrom, on: m.on })) : undefined,
    staff: s.staff
      .filter((p) => p.role !== "Owner")
      .map((p) => ({ id: p.id, name: p.name, phone: e164(p.phone), role: ROLE[p.role], inviteCode: p.inviteCode, ...pay(p.pay) })),
  };
}

registerHandler("setup.save", async (item) => {
  await rpc("save_setup", { p: item.payload });
  void textNewInvites(item.payload as { staff?: { inviteCode?: string }[] });
});

/** After a save reached the server, text each new staff invite once (PolishOS number). Copy link stays the backup. */
const TEXTED = "nailpos.invitesTexted";
async function textNewInvites(p: { staff?: { inviteCode?: string }[] }) {
  let done: string[] = [];
  try { done = JSON.parse(localStorage.getItem(TEXTED) ?? "[]"); } catch { /* none yet */ }
  for (const code of (p.staff ?? []).map((x) => x.inviteCode).filter((c): c is string => !!c && !done.includes(c))) {
    try {
      await textInvite(code);
      done.push(code); // sent, skipped or blocked: logged on the server; never ask twice from here
    } catch { /* not saved yet / no rights: the next save tries again */ }
  }
  try { localStorage.setItem(TEXTED, JSON.stringify(done.slice(-200))); } catch { /* private mode */ }
}

/** Queue a save of the whole wizard (only with real sign-in; the test copy stays on this device). */
export function queueSave(s: SetupState) {
  if (!SMS_ON || !s.salonId) return; // no name yet = saved as "My salon"
  void enqueue("setup.save", JSON.parse(JSON.stringify(toPayload(s))));
}
