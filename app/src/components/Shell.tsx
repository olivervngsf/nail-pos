"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SALON } from "@/lib/data";
import { useStore } from "@/lib/store";

export function OfflineBar() {
  const { t } = useStore();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return <div className="bg-orange-500 text-white text-center py-2 font-semibold">{t("offline")}</div>;
}

export function LangToggle() {
  const { s, actions } = useStore();
  return (
    <div className="flex rounded-full bg-stone-100 p-1 text-sm font-semibold">
      {(["vi", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => actions.setLang(l)}
          className={`px-3 py-1.5 rounded-full ${s.lang === l ? "bg-white shadow text-stone-900" : "text-stone-500"}`}
        >
          {l === "vi" ? "Tiếng Việt" : "English"}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { s, t } = useStore();
  const path = usePathname();
  const ready = s.tickets.filter((x) => x.status === "ready").length;
  const tabs = [
    { href: "/", label: t("turnList") },
    { href: "/check-in", label: t("checkIn") },
    { href: "/checkout", label: t("checkout"), badge: ready },
    { href: "/pin", label: t("staffPin") },
    { href: "/desk", label: s.lang === "vi" ? "Quầy (máy tính)" : "Front desk (desktop)" },
  ];
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-stone-200 print:hidden">
      <OfflineBar />
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="font-bold text-lg text-rose-700 mr-auto">{SALON.name}</div>
        <LangToggle />
      </div>
      <nav className="mx-auto max-w-6xl px-2 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? path === "/" : path.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap px-4 py-3 text-base font-semibold border-b-4 ${
                active ? "border-rose-600 text-rose-700" : "border-transparent text-stone-500"
              }`}
            >
              {tab.label}
              {!!tab.badge && (
                <span className="ml-2 rounded-full bg-rose-600 text-white text-xs px-2 py-0.5">{tab.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function Keypad({ onKey, onDelete, extra }: { onKey: (d: string) => void; onDelete: () => void; extra?: React.ReactNode }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const btn = "h-16 sm:h-20 rounded-2xl bg-stone-100 active:bg-stone-300 text-3xl font-semibold text-stone-800";
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {keys.map((k) => (
        <button key={k} className={btn} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
      <div>{extra}</div>
      <button className={btn} onClick={() => onKey("0")}>
        0
      </button>
      <button className={btn} onClick={onDelete} aria-label="delete">
        ⌫
      </button>
    </div>
  );
}

export const bigBtn =
  "w-full rounded-2xl px-6 py-5 text-xl font-bold disabled:opacity-40 active:scale-[0.99] transition";
export const primary = `${bigBtn} bg-rose-600 text-white active:bg-rose-700`;
export const secondary = `${bigBtn} bg-stone-100 text-stone-800`;
