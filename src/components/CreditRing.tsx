"use client";
// Text credit ring in the left menu (Text Credits board, pick "2 · Two lines"): a small ring above the profile.
// Owner + manager only. Green → orange under the warn % → red at $0. Click → popover: credit, line bar, texts left,
// Manage credit. Hidden for everyone else (the server returns nothing to them).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCents } from "@/lib/money";
import { creditLevel, creditPct, textsLeft, useCredit } from "@/lib/texting/credit";

const COLOR = { good: "var(--jade)", low: "var(--orange)", empty: "var(--red)" } as const;
const C = 2 * Math.PI * 10;

export function CreditRing() {
  const t = useTranslations("credit");
  const { credit } = useCredit();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!credit) return null;
  const level = creditLevel(credit);
  const pct = creditPct(credit);
  const money = formatCents(credit.balanceCents);
  return (
    <div className="cr" ref={box}>
      <button type="button" className={`cr-ring${open ? " cr-open" : ""}`} aria-label={t("ringLabel", { money })} aria-expanded={open}
        title={t("ringLabel", { money })} data-testid="credit-ring" data-level={level} onClick={() => setOpen((v) => !v)}>
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r="10" fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle cx="13" cy="13" r="10" fill="none" stroke={COLOR[level]} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, (C * pct) / 100)} ${C}`} transform="rotate(-90 13 13)" />
        </svg>
      </button>
      {open && (
        <div className="card cr-pop pop" role="dialog" aria-label={t("title")} data-testid="credit-pop">
          <div className="cap cr-head">{t("head")}</div>
          <div className="sep" />
          <div className="cr-body">
            <div className="line"><span>{t("credit")}</span><b data-testid="credit-amount" style={{ color: level === "good" ? undefined : COLOR[level] }}>{money}</b></div>
            <div className="prog-bar thin"><span style={{ width: `${pct}%`, background: COLOR[level] }} /></div>
            <div className="cap">{level === "empty" ? t("empty") : level === "low" ? t("low", { n: textsLeft(credit).toLocaleString("en-US") }) : t("left", { n: textsLeft(credit).toLocaleString("en-US"), pct: credit.warnPct })}</div>
          </div>
          <div className="sep" />
          <Link className="cr-link" href="/settings/texting" onClick={() => setOpen(false)}>{t("manage")}</Link>
        </div>
      )}
    </div>
  );
}
