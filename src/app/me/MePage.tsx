"use client";
// Profile (board "Settings Map + Back Rules", After 3) = who I am + how I sign in, nothing else: big photo + Edit photo,
// one card (name, sign-in phone, role), Sign in + security (Sign in, My sign-ins). PIN, Language, Text size and
// Sign out each have ONE home: the Settings list. Back = ‹ Settings.
// Name is saved with ✓ in the header. Own login only for the photo + sign-in; on a salon device the person working
// changes their PIN from the faces screen instead.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, Banner, LeftMenu, Toast } from "@/components/kit";
import { rpc, SMS_ON } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { removeMyPhoto, setMyPhoto, useMyPhoto } from "@/lib/photo";
import { fmtPhone } from "@/lib/onboarding/data";
import { useMe } from "@/lib/me";
import { SaveCheck, SettingsWindow } from "../settings/SettingsShell";

const PERSON = "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4.5-6 8-6s7 2 8 6";
const PHONE = "M7 2h10v20H7zM11 18h2";
const HOME = "M3 11l9-7 9 7v9H3z";
const SHIELD = "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z";
const SCREEN = "M3 5h18v12H3zM8 21h8M12 17v4";
/** Row icon, same line style as the Settings list. */
const MeIco = ({ d }: { d: string }) => <svg className="me-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

export default function MePage() {
  const t = useTranslations("me");
  const ta = useTranslations("account");
  const { me, isDevice, acting } = useMe();
  const photo = useMyPhoto();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if (!me) return;
    setName(me.name); setSaved(me.name);
    if (SMS_ON) {
      void getSupabase()?.auth.getUser().then(({ data }) => setPhone(data.user?.phone ? fmtPhone(data.user.phone.replace(/^1/, "")) : "")).catch(() => {});
    }
  }, [me]);

  if (!me) return <div className="app" aria-busy="true" />;
  const someoneElse = isDevice && acting && acting.name !== me.name;
  const dirty = name.trim() !== saved && !!name.trim();

  const saveName = async () => {
    if (!dirty) return;
    setBusy(true);
    try { if (SMS_ON) await rpc("save_my_name", { p_salon: me.salonId, p_name: name.trim() }); setSaved(name.trim()); say(t("saved")); }
    catch (e) { say((e as Error).message); }
    setBusy(false);
  };
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    try { await setMyPhoto(f); say(t("photoSaved")); }
    catch (e) { const m = (e as Error).message; say(m === "offline" ? t("photoOffline") : m === "photo" ? t("photoBad") : m); }
    setPhotoBusy(false);
    if (file.current) file.current.value = "";
  };
  const dropPhoto = async () => {
    setPhotoBusy(true);
    try { await removeMyPhoto(); say(t("photoRemoved")); } catch (e) { say((e as Error).message === "offline" ? t("photoOffline") : (e as Error).message); }
    setPhotoBusy(false);
  };

  return (
    <div className="app me-app set-app">
      <LeftMenu active="Me" salonInitials={me.salonName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} me={me.name} />
      <SettingsWindow role={isDevice ? (acting?.role ?? me.role) : me.role} title={t("titleShort")}>
        <main className="me-main me-v2">
          {someoneElse && <Banner tone="info">{t("onDevice", { name: acting!.name })}</Banner>}

          <section className="me-photo" data-testid="me-photo">
            <Avatar name={saved || me.name} src={isDevice ? undefined : photo} className="me-av" />
            {!isDevice && <div className="me-photo-acts">
              <label className={`me-photo-btn${photoBusy ? " busy" : ""}`} data-testid="photo-edit">
                {photoBusy ? t("photoSaving") : photo ? t("photoChange") : t("photoAdd")}
                <input ref={file} type="file" accept="image/*" disabled={photoBusy} onChange={(e) => void pickPhoto(e.target.files?.[0])} data-testid="photo-input" />
              </label>
              {photo && !photoBusy && <button type="button" className="me-photo-rm" onClick={() => void dropPhoto()} data-testid="photo-remove">{t("photoRemove")}</button>}
            </div>}
          </section>

          <div>
            <section className="me-card">
              <label className="me-f"><MeIco d={PERSON} /><span className="me-k">{t("nameShort")}</span>
                <input id="me-name" className="me-in" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" data-testid="me-name" /></label>
              <div className="me-f"><MeIco d={PHONE} /><span className="me-k">{t("phone")}</span><span className="me-v num">{phone || (SMS_ON ? "—" : "(408) 555-0101")}</span><span className="me-tag">{t("signInTag")}</span></div>
              <div className="me-f"><MeIco d={HOME} /><span className="me-k">{t("role")}</span><span className="me-v">{ta(`role.${me.role}`)} · {me.salonName}</span></div>
            </section>
            <p className="me-hint">{t("nameHint")}</p>
          </div>

          <div>
            <div className="me-h">{t("signInSecurity")}</div>
            <section className="me-card" data-testid="my-sign-in">
              <Link href="/me/sign-in" className="me-f me-link" data-testid="me-sign-in"><MeIco d={SHIELD} /><span className="me-k">{t("signInShort")}</span><span className="me-v r">{t("signInWays")}</span><span className="me-chev" aria-hidden>›</span></Link>
              {!isDevice && <Link href="/me/sign-ins" className="me-f me-link" data-testid="me-sign-ins"><MeIco d={SCREEN} /><span className="me-k">{t("signInsShort")}</span><span className="me-v r">{t("signInsSub")}</span><span className="me-chev" aria-hidden>›</span></Link>}
            </section>
          </div>

          {me.role === "tech" && <section className="me-card"><Link href="/t" className="me-f me-link"><span className="me-k" style={{ flex: 1 }}>{t("techApp")}</span><span className="me-chev" aria-hidden>›</span></Link></section>}
          {!SMS_ON && <div className="demo">{t("demo")}</div>}
          <SaveCheck dirty={dirty} busy={busy} onSave={() => void saveName()} onUndo={() => setName(saved)} testId="me-save" />
        </main>
      </SettingsWindow>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
