// Salon device on / off, from its last "I'm on" signal (DeviceBeat → device_ping → devices.last_seen).
// One rule for every screen: Settings → Devices, Founder Admin salons table + salon page.
export type DeviceState = "on" | "off" | "never";
export const DEVICE_ON_MS = 10 * 60_000; // the beat is every 4 minutes, so two missed beats = off

export function deviceState(lastSeen: string | null | undefined, now: number): DeviceState {
  if (!lastSeen) return "never";
  return now - Date.parse(lastSeen) < DEVICE_ON_MS ? "on" : "off";
}
/** How many are on, for "2 of 3 on". */
export const devicesOn = (lastSeen: (string | null | undefined)[], now: number) => lastSeen.filter((x) => deviceState(x, now) === "on").length;
