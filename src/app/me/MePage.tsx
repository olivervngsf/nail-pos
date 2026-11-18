"use client";
// My profile (board 4.1/4.2): who I am, language, my PIN, sign-in email + password, sign out. Own login only;
// on a salon device the person working changes their PIN from the faces screen instead.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, Button, LeftMenu, ListGroup, PinKeypad, Segmented, SyncPill, Toast, TopBar } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import SignInEmail from "@/components/SignInEmail";
import SignInPassword from "@/components/SignInPassword";
import { rpc, signOut, SMS_ON } from "@/lib/auth";
import { cachedRules, pinProblem, saveRules, type PinRules } from "@/lib/pin";
import { isAdminRole, useMe } from "@/lib/me";

export default function MePage() {
  const t = useTranslations("me");
  const ta = useTranslations("account");
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { me, isDevice, acting } = useMe();
  const [rules, setRules] = useState<PinRules>(cachedRules(null));
  const [name, setName] = useState("");
  const [pinStep, setPinStep] = useState<"" | "one" | "two">("");
  const [first, setFirst] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setRules(cachedRules(me.salonId));
    if (SMS_ON) void rpc<PinRules>("pin_rules", { p_salon: me.salonId }).then((r) => { setRules(r); saveRules(me.salonId, r); }).catch(() => {});
  }, [me]);

  if (!me) return <div className="app" aria-busy="true" />;
  const vi = lang === "vi";
  const someoneElse = isDevice && acting && acting.name !== me.name;

  const saveName = async () => {
    if (!name.trim() || name.trim() === me.name) return;
    try { if (SMS_ON) await rpc("save_my_name", { p_salon: me.salonId, p_name: name.trim() }); say(t("saved")); } catch (e) { say((e as Error).message); }
  };
  const pinDone = async (pin: string) => {
    setPinErr("");
    if (pinStep === "one") {
      const p = pinProblem(pin, rules.length);
      if (p) return setPinErr(t(`pinBad.${p}`, { n: rules.length }));
      setFirst(pin); setPinStep("two"); return;
    }
    if (pin !== first) { setPinErr(t("pinMismatch")); setPinStep("one"); return; }
    try {
      if (SMS_ON) await rpc("set_my_pin", { p_salon: me.salonId, p_pin: pin });
      setPinStep(""); say(t("pinSaved"));
    } catch (e) { setPinErr((e as Error).message.includes("weak") ? t("pinBad.run", { n: rules.length }) : (e as Error).message); setPinStep("one"); }
  };

  return (
    <div className="app me-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <div className="col">
        <TopBar title={t("title")}><SyncPill /></TopBar>
        <main className="me-main">
          {someoneElse && <div className="banner" role="status">{t("onDevice", { name: acting!.name })}</div>}
          <section className="card pad me-head">
            <Avatar name={me.name} large />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="h2" style={{ display: "block" }}>{me.name}</span>
              <span className="cap">{ta(`role.${me.role}`)} · {me.salonName}</span>
            </span>
          </section>

          <div className="eyebrow">{t("about")}</div>
          <section className="card pad" style={{ gap: 12 }}>
            <div>
              <label className="lbl" htmlFor="me-name">{t("name")}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="me-name" className="inp" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={() => void saveName()} disabled={!name.trim() || name.trim() === me.name}>{t("save")}</Button>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>{ta("language")}<span className="cap" style={{ display: "block" }}>{t("languageNote")}</span></span>
              <Segmented label={ta("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }]} />
            </div>
          </section>

          <div className="eyebrow">{t("pin")}</div>
          <section className="card pad" style={{ gap: 12 }} data-testid="my-pin">
            {!pinStep
              ? <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ flex: 1 }}>{t("pinNow", { n: rules.length })}<span className="cap" style={{ display: "block" }}>{t("pinUse")}</span></span>
                  <Button data-testid="change-pin" onClick={() => { setPinErr(""); setPinStep("one"); }}>{t("changePin")}</Button>
                </div>
              : <div style={{ maxWidth: 320, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                  <b style={{ textAlign: "center" }}>{pinStep === "one" ? t("pinNew", { n: rules.length }) : t("pinAgain")}</b>
                  <PinKeypad key={pinStep} length={rules.length} error={pinErr} onDone={(p) => void pinDone(p)} />
                  <Button variant="ghost" onClick={() => setPinStep("")}>{t("cancel")}</Button>
                </div>}
          </section>

          <div className="eyebrow">{t("signIn")}</div>
          <section className="card pad" style={{ gap: 12 }}>
            <SignInEmail vi={vi} />
            <div className="sep" />
            <SignInPassword vi={vi} />
          </section>

          <ListGroup>
            {isAdminRole(me.role) && <button type="button" className="opt" onClick={() => router.push("/settings")}>{ta("settings")}<span className="cap" style={{ marginLeft: "auto" }}>›</span></button>}
            {me.role === "tech" && <button type="button" className="opt" onClick={() => router.push("/t")}>{t("techApp")}<span className="cap" style={{ marginLeft: "auto" }}>›</span></button>}
            {!isDevice && <button type="button" className="opt rail-pop-out" data-testid="sign-out" style={{ padding: "0 16px" }}
              onClick={async () => { await signOut(); router.replace("/login"); }}>{ta("signOut")}</button>}
          </ListGroup>
          {!SMS_ON && <div className="demo">{t("demo")}</div>}
        </main>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
