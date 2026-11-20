"use client";
// Make your PIN. Two ways in:
// - Personal link /t/pin?c=<code> (Settings → Team → Copy / Text the PIN link): knows WHO it's for (pin_link_get: name,
//   salon, phone ending). They sign in with that phone (code by text), then PIN twice → pin_link_set (one use, 7 days).
// - Own PIN /t/pin?s=<salon> (tech app → Me → My PIN): the signed-in person changes their own PIN → set_my_pin.
// PIN length = the salon's rule.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, PinKeypad, Segmented } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import { SMS_ON, claimMine, homeFor, isSignedIn, myMemberships, rpc, signOut, type Membership } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { cachedRules, pinProblem, saveRules, type PinRules } from "@/lib/pin";

type Step = "load" | "signin" | "notHere" | "ended" | "hasPin" | "one" | "two" | "done";
type LinkInfo = { salon_id: string; salon_name: string; membership_id: string; display_name: string; phone_last4: string; language: "en" | "vi"; status: "open" | "used" | "expired" };

export default function PinLinkPage() {
  const t = useTranslations("pinLink");
  const router = useRouter();
  const q = useSearchParams();
  const code = (q.get("c") ?? "").toUpperCase();
  const [link, setLink] = useState<LinkInfo | null>(null);
  const salon = link?.salon_id ?? q.get("s") ?? "";
  const { lang, setLang } = useLang();
  const [step, setStep] = useState<Step>("load");
  const [phone, setPhone] = useState("");
  const [m, setM] = useState<Membership | null>(null);
  const [all, setAll] = useState<Membership[]>([]);
  const [rules, setRules] = useState<PinRules>(cachedRules(salon));
  const [first, setFirst] = useState("");
  const [err, setErr] = useState("");
  const [last4, setLast4] = useState("");

  const findMe = async (info: LinkInfo | null = link) => {
    await claimMine();
    const u = (await getSupabase()?.auth.getUser())?.data.user;
    setLast4((u?.phone ?? "").replace(/\D/g, "").slice(-4));
    const ms = await myMemberships();
    setAll(ms);
    const mine = info ? ms.find((x) => x.membership_id === info.membership_id) ?? null
      : ms.find((x) => x.salon_id === salon && x.membership_id) ?? (salon ? null : ms.find((x) => x.membership_id) ?? null);
    if (!mine) return setStep("notHere");
    setM(mine);
    if (mine.language && mine.language !== lang) setLang(mine.language);
    void rpc<PinRules>("pin_rules", { p_salon: mine.salon_id }).then((r) => { setRules(r); saveRules(mine.salon_id, r); }).catch(() => {});
    setStep(mine.has_pin && !info ? "hasPin" : "one");
  };

  useEffect(() => {
    if (!SMS_ON) { setStep("one"); return; }
    void (async () => {
      let info: LinkInfo | null = null;
      if (code) {
        info = (await rpc<LinkInfo[]>("pin_link_get", { p_code: code }).catch(() => []))[0] ?? null;
        if (!info || info.status !== "open") { setLink(info); setStep("ended"); return; }
        setLink(info);
        if (info.language !== lang) setLang(info.language);
      }
      const yes = await isSignedIn();
      if (yes) await findMe(info).catch((e) => { setErr((e as Error).message); setStep("signin"); });
      else setStep("signin");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinDone = async (pin: string) => {
    setErr("");
    if (step === "one") {
      if (pinProblem(pin, rules.length)) return setErr(t("weak"));
      setFirst(pin); setStep("two"); return;
    }
    if (pin !== first) { setErr(t("nomatch")); setFirst(""); setStep("one"); return; }
    try {
      if (SMS_ON && link) await rpc("pin_link_set", { p_code: code, p_pin: pin });
      else if (SMS_ON && m) await rpc("set_my_pin", { p_salon: m.salon_id, p_pin: pin });
      setStep("done");
    } catch (e) { setErr((e as Error).message.includes("weak") ? t("weak") : (e as Error).message); setFirst(""); setStep("one"); }
  };

  // The phone may already be signed in as someone else (the owner testing the link, a shared phone): always say who,
  // and let them switch to their own phone number.
  const switchPhone = async () => { await signOut(); setM(null); setErr(""); setPhone(""); setStep("signin"); };
  const who = SMS_ON && last4 ? (
    <div className="cap" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {t("signedAs", { name: m?.display_name ?? "", last4 })}
      <Button size="sm" variant="ghost" data-testid="switch-phone" onClick={() => void switchPhone()}>{t("notYou")}</Button>
    </div>
  ) : null;
  const salonName = m?.salon_name || link?.salon_name || (lang === "vi" ? "tiệm" : "the salon");
  return (
    <div className="phone">
      <div className="pbar"><span>PolishOS</span></div>
      <div className="pbody in" key={step}>
        <Segmented label="Language" value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }]} />
        {step === "load" && <div aria-busy="true" />}
        {step === "signin" && <>
          {link && <div className="bubble">{t("forWho", { name: link.display_name, salon: link.salon_name })}</div>}
          <PhoneCodeLogin phone={phone} setPhone={setPhone} title={t("signIn")}
            lead={link?.phone_last4 ? t("signInLast4", { last4: link.phone_last4 }) : t("signInLead")}
            onDone={() => findMe().catch((e) => setErr((e as Error).message))} />
          {err && <div className="hint err" role="alert">{err}</div>}
        </>}
        {step === "ended" && <>
          <h1 className="h2">{t("title")}</h1>
          <div className="hint err" role="alert">{link?.status === "used" ? t("linkUsed") : t("linkEnded")}</div>
        </>}
        {step === "notHere" && <>
          <h1 className="h2">{t("title")}</h1>
          <div className="hint err" role="alert">{t("notHere")}</div>
          {last4 && <div className="cap">{t("signedAsPhone", { last4 })}</div>}
          <Button variant="primary" block onClick={() => void switchPhone()}>{t("usePhone")}</Button>
        </>}
        {step === "hasPin" && <>
          <h1 className="h2">{t("title")}</h1>
          {who}
          <div className="cap lead">{t("hasPin", { salon: salonName })}</div>
          <Button variant="primary" block onClick={() => setStep("one")}>{t("newPin")}</Button>
          <Button block onClick={() => router.push(homeFor(all))}>{t("home")}</Button>
        </>}
        {(step === "one" || step === "two") && <>
          <h1 className="h2" style={{ textAlign: "center" }}>{step === "one" ? t("pin1", { n: rules.length }) : t("pin2")}</h1>
          {step === "one" && <div className="cap" style={{ textAlign: "center" }}>{t("pin1Cap")}</div>}
          {step === "one" && who}
          <PinKeypad key={step} length={rules.length} error={err} onDone={(p) => void pinDone(p)} />
          {!SMS_ON && <div className="demo">{t("demo")}</div>}
        </>}
        {step === "done" && <>
          <div className="okmark" style={{ alignSelf: "center" }}>✓</div>
          <h1 className="h2" style={{ textAlign: "center" }}>{t("done")}</h1>
          <div className="cap lead" style={{ textAlign: "center" }}>{t("doneCap", { salon: salonName })}</div>
          <Button variant="primary" block onClick={() => router.push(SMS_ON ? homeFor(all) : "/t")}>{t("home")}</Button>
        </>}
      </div>
    </div>
  );
}
