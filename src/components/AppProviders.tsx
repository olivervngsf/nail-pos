"use client";
// App-wide: language (EN/VI per person, saved on the device) + the offline sync loop.
import { createContext, useContext, useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/i18n/en.json";
import vi from "@/i18n/vi.json";
import { registerHandler, startSync } from "@/lib/offline/outbox";
import SupportBanner from "@/components/SupportBanner";

export type Lang = "en" | "vi";
const MESSAGES = { en, vi };
const LANG_KEY = "nailpos.lang";

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export const useLang = () => useContext(LangCtx);

// Built-in sync handlers. Feature handlers register themselves where they are defined.
registerHandler("dev.ping", async (item) => {
  const r = await fetch("/api/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: item.clientId, tag: (item.payload as { tag?: string })?.tag, payload: item.payload }),
  });
  if (!r.ok) throw new Error(`ping failed: ${r.status}`);
});

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "vi") setLangState(saved);
    } catch {
      /* storage blocked */
    }
    startSync();
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  };
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]} timeZone="America/Los_Angeles">
        <SupportBanner />
        {children}
      </NextIntlClientProvider>
    </LangCtx.Provider>
  );
}
