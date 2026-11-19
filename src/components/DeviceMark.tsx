// One mark for a salon device's state, easy to skim: on = filled green circle with a check, off = empty orange ring,
// never on = dashed grey ring. Always shown next to a word ("On now" / "Off"), so it is decoration for screen readers.
import type { DeviceState } from "@/lib/devices";

export default function DeviceMark({ state, size = 20 }: { state: DeviceState; size?: number }) {
  return (
    <svg className={`dv-mark is-${state}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {state === "on" && <><circle cx="10" cy="10" r="10" fill="var(--jade)" /><path d="M5.6 10.4l2.9 2.9 5.9-6.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>}
      {state === "off" && <circle cx="10" cy="10" r="8.5" fill="#fff" stroke="var(--orange)" strokeWidth="3" />}
      {state === "never" && <circle cx="10" cy="10" r="8.75" fill="#fff" stroke="var(--muted)" strokeWidth="2" strokeDasharray="3.2 3.2" />}
    </svg>
  );
}
