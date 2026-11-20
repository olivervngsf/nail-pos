// One status icon for health checks (Founder Admin health table + salon page): never colour alone, each tone has a shape.
// good = blue circle with ✓ · watch = yellow circle with ! · bad = red circle with ✕ · none = dashed grey ring (not set up).
// Always next to a word, so it is decoration for screen readers (pass `label` when it stands alone).
import type { Tone } from "@/lib/admin/signals";

export default function StatusIcon({ tone, size = 18, label }: { tone: Tone; size?: number; label?: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg className={`st-icon is-${tone}`} width={size} height={size} viewBox="0 0 20 20" focusable="false" {...a11y}>
      {tone === "none"
        ? <circle cx="10" cy="10" r="8.75" fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="3.2 3.2" />
        : <circle cx="10" cy="10" r="10" fill={tone === "good" ? "var(--st-good)" : tone === "watch" ? "var(--st-watch)" : "var(--st-bad)"} />}
      {tone === "good" && <path d="M5.6 10.4l2.9 2.9 5.9-6.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      {tone === "watch" && <><path d="M10 5v6" stroke="#3D2A00" strokeWidth="2.4" strokeLinecap="round" /><circle cx="10" cy="14.6" r="1.4" fill="#3D2A00" /></>}
      {tone === "bad" && <path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}
