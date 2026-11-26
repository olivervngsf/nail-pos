"use client";
// Pieces of the profile pop-up (board "Settings, Activity log + Timesheet" → Profile pop-up A · B · C, Nov 26):
// one row look, the Language / Text size side menus, "My time today" and the icons. Used by the desk pop-up
// (RailAccount: A = own login, B = salon device) and the tech phone sheet (TechSheet in src/app/t/tech.tsx: C).
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useLang } from "@/components/AppProviders";
import { rpc, SMS_ON } from "@/lib/auth";
import { getTextSize, setTextSize, TEXT_SIZES, type TextSize } from "@/lib/textSize";
import { fmtMin } from "@/lib/timesheet";

export const SUPPORT_MAIL = "mailto:support@polishosapp.com?subject=PolishOS%20help";

export const IC = {
  user: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4.5-6 8-6s7 2 8 6",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  log: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  bill: "M2 6h20v12H2zM2 10h20",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9",
  size: "M4 19L9 5l5 14M6 14h6M15 19l3-8 3 8M16 17h4",
  help: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17v.5",
  news: "M5 3h14v18H5zM9 7h6M9 11h6M9 15h3",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  money: "M2 6h20v12H2zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  home: "M3 11l9-7 9 7v9H3zM9 20v-6h6v6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  out: "M14 4h5v16h-5M10 17l-5-5 5-5M5 12h11",
};

export const Ico = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg className="pm-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

/** One menu row: icon, words, grey right text. A link (href), or a button (onClick). */
export function PmRow({ icon, label, right, href, onClick, testid, sub, open, onHover }: {
  icon: string; label: string; right?: ReactNode; href?: string; onClick?: () => void; testid?: string;
  sub?: boolean; open?: boolean; onHover?: () => void;
}) {
  const inner = <><Ico d={icon} />{label}{right != null && right !== "" && <span className="pm-r">{right}</span>}</>;
  if (href) return <a role="menuitem" className="pm-it" href={href} data-testid={testid} onMouseEnter={onHover} onClick={onClick}>{inner}</a>;
  return (
    <button type="button" role="menuitem" className={`pm-it${open ? " on" : ""}`} data-testid={testid} aria-haspopup={sub ? "menu" : undefined} aria-expanded={sub ? !!open : undefined}
      onMouseEnter={onHover} onClick={onClick}>{inner}</button>
  );
}

type SubProps = { sub: string | null; setSub: (s: string | null) => void; inline?: boolean; long?: boolean };
const hoverFor = (inline: boolean | undefined, setSub: SubProps["setSub"], k: string) => (inline ? undefined : () => setSub(k));

/** Language row + its side menu (desktop: beside the pop-up on hover or tap; phone sheet: opens below). */
export function LangRow({ sub, setSub, inline, long }: SubProps) {
  const t = useTranslations("account");
  const { lang, setLang } = useLang();
  const langName = (l: "en" | "vi") => (l === "en" ? "English" : "Tiếng Việt");
  return (
    <div className="pm-subw">
      <PmRow icon={IC.globe} label={t("language")} right={`${long ? langName(lang) : lang.toUpperCase()} ›`} sub open={sub === "lang"} onHover={hoverFor(inline, setSub, "lang")} onClick={() => setSub(sub === "lang" ? null : "lang")} testid="pm-lang" />
      {sub === "lang" && (
        <div className={inline ? "pm-sub in" : "pm-sub"} role="menu" aria-label={t("language")}>
          {(["en", "vi"] as const).map((l) => (
            <button key={l} type="button" role="menuitemradio" aria-checked={lang === l} className={`pm-it${lang === l ? " sel" : ""}`} data-testid={`pm-lang-${l}`} onClick={() => { setLang(l); setSub(null); }}>
              {langName(l)}{lang === l && <span className="pm-r pm-ck">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Text size row + its side menu: Normal / Large / Larger, each shown in its own size. */
export function SizeRow({ sub, setSub, inline }: SubProps) {
  const t = useTranslations("account");
  const [size, setSize] = useState<TextSize>("normal");
  useEffect(() => setSize(getTextSize()), []);
  return (
    <div className="pm-subw">
      <PmRow icon={IC.size} label={t("textSize")} right={`${t(`size.${size}`)} ›`} sub open={sub === "size"} onHover={hoverFor(inline, setSub, "size")} onClick={() => setSub(sub === "size" ? null : "size")} testid="pm-size" />
      {sub === "size" && (
        <div className={inline ? "pm-sub in" : "pm-sub"} role="menu" aria-label={t("textSize")}>
          {TEXT_SIZES.map((s, i) => (
            <button key={s} type="button" role="menuitemradio" aria-checked={size === s} className={`pm-it${size === s ? " sel" : ""}`} style={{ fontSize: [14, 17, 20][i] }} data-testid={`pm-size-${s}`}
              onClick={() => { setTextSize(s); setSize(s); setSub(null); }}>
              {t(`size.${s}`)}{size === s && <span className="pm-r pm-ck">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LangAndSize(p: SubProps) { return <><LangRow {...p} /><SizeRow {...p} /></>; }

/** Minutes clocked in today for one person (own login: yourself; salon device: who unlocked). Test copy = sample number. */
export function useMyTime(salonId: string | undefined, membershipId: string | undefined, demo: number) {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    if (!SMS_ON) { setMin(demo); return; }
    if (!salonId || salonId === "demo") return;
    let off = false;
    rpc<{ minutes: number }[]>("my_time_today", { p_salon: salonId, p_membership: membershipId ?? null })
      .then((r) => { if (!off) setMin(r?.[0]?.minutes ?? 0); }).catch(() => { /* offline: leave it blank */ });
    return () => { off = true; };
  }, [salonId, membershipId, demo]);
  return min == null ? "" : fmtMin(min);
}
