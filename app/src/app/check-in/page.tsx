"use client";

import Link from "next/link";
import { useState } from "react";
import { Header, Keypad, primary, secondary } from "@/components/Shell";
import { SERVICES, serviceById, staffById, techs } from "@/lib/data";
import { fmt, prettyPhone, sumServices } from "@/lib/money";
import { clientByPhone, isClockedIn, useStore } from "@/lib/store";

type Step = "phone" | "client" | "services" | "tech" | "done";

export default function CheckIn() {
  const { s, t, actions } = useStore();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const existing = clientByPhone(s, phone);

  const reset = () => {
    setStep("phone");
    setPhone("");
    setName("");
    setEmail("");
    setPicked([]);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const finish = (techId: string | null) => {
    if (!existing) actions.upsertClient({ phone, name: name.trim(), email: email.trim() || undefined, visits: 0 });
    actions.checkIn({ phone, serviceIds: picked, requestedTechId: techId });
    setStep("done");
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md p-4">
        {step === "phone" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-center">{t("phoneNumber")}</h1>
            <div className="text-4xl font-semibold text-center tracking-wide h-12">{prettyPhone(phone) || <span className="text-stone-300">(___) ___-____</span>}</div>
            <Keypad onKey={(d) => setPhone((p) => (p.length < 10 ? p + d : p))} onDelete={() => setPhone((p) => p.slice(0, -1))} />
            <button
              className={primary}
              disabled={phone.length !== 10}
              onClick={() => {
                const c = clientByPhone(s, phone);
                if (c?.lastServiceId) setPicked([c.lastServiceId]);
                setStep("client");
              }}
            >
              {t("continue")}
            </button>
            <p className="text-center text-sm text-stone-400">Demo: 415 555 0101 → Linh Nguyen</p>
          </div>
        )}

        {step === "client" && (
          <div className="space-y-5">
            {existing ? (
              <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm">
                <div className="text-sm font-semibold text-emerald-700">{t("found")}</div>
                <div className="text-2xl font-bold">{existing.name}</div>
                <div className="text-stone-500">{prettyPhone(existing.phone)}</div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-stone-500">{t("visits")}</dt>
                  <dd className="font-semibold">{existing.visits}</dd>
                  <dt className="text-stone-500">{t("lastVisit")}</dt>
                  <dd className="font-semibold">
                    {existing.lastVisit} · {serviceById(existing.lastServiceId ?? "")?.[s.lang]} · {staffById(existing.lastTechId ?? "")?.name}
                  </dd>
                </dl>
                {existing.notes && (
                  <div className="mt-3 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">
                    <b>{t("notes")}:</b> {existing.notes}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-blue-700">{t("newClient")} · {prettyPhone(phone)}</div>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name")} className="w-full rounded-2xl border-2 border-stone-200 p-4 text-xl" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailOpt")} type="email" className="w-full rounded-2xl border-2 border-stone-200 p-4 text-xl" />
              </div>
            )}
            <button className={primary} disabled={!existing && !name.trim()} onClick={() => setStep("services")}>
              {t("continue")}
            </button>
            <button className={secondary} onClick={() => setStep("phone")}>
              {t("back")}
            </button>
          </div>
        )}

        {step === "services" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">{t("pickServices")}</h1>
            {[false, true].map((addon) => (
              <div key={String(addon)}>
                {addon && <h2 className="font-bold text-stone-500 mb-2">{t("addons")}</h2>}
                <div className="grid grid-cols-2 gap-2">
                  {SERVICES.filter((x) => !!x.addon === addon).map((x) => {
                    const on = picked.includes(x.id);
                    return (
                      <button key={x.id} onClick={() => toggle(x.id)} className={`rounded-2xl border-2 p-3 text-left ${on ? "border-rose-600 bg-rose-50" : "border-stone-200 bg-white"}`}>
                        <div className="font-bold">{x[s.lang]}</div>
                        <div className="text-sm text-stone-500">
                          {fmt(x.priceCents)} · {x.minutes}m
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button className={primary} disabled={!picked.some((id) => !serviceById(id)?.addon)} onClick={() => setStep("tech")}>
              {t("continue")} · {fmt(sumServices(picked))}
            </button>
            <button className={secondary} onClick={() => setStep("client")}>
              {t("back")}
            </button>
          </div>
        )}

        {step === "tech" && (
          <div className="space-y-3">
            <h1 className="text-2xl font-bold">{t("pickTech")} {existing?.name ?? name}</h1>
            <button className={primary} onClick={() => finish(null)}>
              {t("anyTech")}
            </button>
            <div className="grid grid-cols-2 gap-2">
              {techs().map((x) => (
                <button key={x.id} onClick={() => finish(x.id)} className="rounded-2xl border-2 border-stone-200 bg-white p-4 text-left">
                  <div className="text-lg font-bold">
                    {x.name}
                    {existing?.lastTechId === x.id && <span className="ml-1 text-xs text-blue-700">★</span>}
                  </div>
                  <div className="text-sm text-stone-500">{isClockedIn(s, x.id) ? "✓ " + t("techsWorking") : "—"}</div>
                </button>
              ))}
            </div>
            <button className={secondary} onClick={() => setStep("services")}>
              {t("back")}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-6 pt-10">
            <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 text-5xl flex items-center justify-center">✓</div>
            <h1 className="text-2xl font-bold">{t("addedToList")}</h1>
            <Link href="/" className={primary + " block"}>
              {t("turnList")}
            </Link>
            <button className={secondary} onClick={reset}>
              {t("checkInClient")}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
