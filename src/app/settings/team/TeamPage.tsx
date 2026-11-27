"use client";
// Settings → Team (board 5.1): everyone in the salon, who is in, pay, license; + Add member with full details.
// Owner sets pay; managers edit the rest. A new member gets an invite link (they set their own PIN on their phone).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, DateField, Drawer, Field, ListGroup, PinKeypad, Toast } from "@/components/kit";
import { cachedRules, pinProblem } from "@/lib/pin";
import { e164, rpc, type Role } from "@/lib/auth";
import { fmtPhone, phoneOk } from "@/lib/onboarding/data";
import { DAYS, DEMO_TEAM, SKILLS, TEAM_GROUPS, blankMember, clockWhen, groupOf, licenseDaysLeft, memberStatus, payLabel, savePayload, statusTone, type Member, type PayType } from "@/lib/team";
import StatusIcon from "@/components/StatusIcon";
import SettingsShell, { type Access } from "../SettingsShell";
import { textInvite, textLine, textPinLink, type SendReply } from "@/lib/texting/client";

type Filter = "all" | "tech" | "desk" | "invited" | "nopin" | "in" | "license";
const licenseSoon = (m: Member) => { const d = licenseDaysLeft(m); return d !== null && d <= 30; };
const inFilter = (f: Filter, m: Member) => f === "all" || (f === "tech" && m.role === "tech") || (f === "desk" && m.role !== "tech")
  || (f === "invited" && !m.joined) || (f === "nopin" && m.joined && !m.hasPin) || (f === "in" && m.clockedIn) || (f === "license" && licenseSoon(m));
const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const nums = (x: Member): Member => ({ ...x, commissionPct: x.commissionPct == null ? null : Number(x.commissionPct), hourlyCents: x.hourlyCents == null ? null : Number(x.hourlyCents), checkPct: Number(x.checkPct ?? 100) });

export default function TeamPage() {
  const t = useTranslations("settings");
  const [edit, setEdit] = useState<Member | null>(null);
  return (
    <SettingsShell title={t("nav.team")} actions={<Button variant="primary" data-testid="add-member" onClick={() => setEdit(blankMember())}>{t("team.add")}</Button>}>
      {(a) => <Team a={a} edit={edit} setEdit={setEdit} />}
    </SettingsShell>
  );
}

function Team({ a, edit, setEdit }: { a: Access; edit: Member | null; setEdit: (m: Member | null) => void }) {
  const t = useTranslations("settings");
  const ta = useTranslations("account");
  const [team, setTeam] = useState<Member[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const load = useCallback(async () => {
    if (a.demo) { setTeam((cur) => cur ?? DEMO_TEAM); return; }
    try { setTeam((await rpc<Member[]>("team_list", { p_salon: a.salonId })).map(nums)); } catch (e) { setErr((e as Error).message); }
  }, [a.demo, a.salonId]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (team ?? []).filter((m) =>
    inFilter(filter, m)
    && (!q || m.name.toLowerCase().includes(q.toLowerCase()) || m.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~"))), [team, filter, q]);

  if (err) return <p className="hint err">{err}</p>;
  if (!team) return <div aria-busy="true" />;
  const count = (f: Filter) => team.filter((m) => inFilter(f, m)).length;
  const pick = (f: Filter) => setFilter((cur) => (cur === f ? "all" : f));
  // Tiles: what's going on + what needs the owner. Tap = show only those (tap again = everyone).
  const tiles: { f: Filter; tone: "good" | "watch" | "bad"; n: number; show: boolean }[] = [
    { f: "in", tone: "good", n: count("in"), show: true },
    { f: "invited", tone: "watch", n: count("invited"), show: true },
    { f: "nopin", tone: "watch", n: count("nopin"), show: count("nopin") > 0 },
    { f: "license", tone: "watch", n: count("license"), show: count("license") > 0 },
  ];
  const grouped = filter === "all" && !q;
  const quickText = async (m: Member) => {
    if (a.demo) return say(t("m.textDemo"));
    try {
      const code = m.invite ?? await rpc<string>("team_invite", { p_membership: m.id });
      let r = await textInvite(code).catch((e: Error) => ({ status: "error", error: e.message }) as SendReply);
      if (r.status === "error" && /ended/.test(r.error ?? "")) r = await textInvite(await rpc<string>("team_invite", { p_membership: m.id }));
      say(r.status === "sent" || r.status === "queued" || r.status === "delivered" ? t("team.inviteTexted", { name: m.name })
        : t("team.inviteNotTexted", { why: r.status === "error" ? r.error ?? "" : r.duplicate ? t("m.textAgain") : textLine(r) }));
    } catch (e) { say((e as Error).message); }
  };
  const row = (m: Member) => {
    const st = memberStatus(m);
    const tone = statusTone(st, m);
    const when = st === "in" ? clockWhen(m.lastClock) : st === "out" ? clockWhen(m.lastClock) : "";
    const word = t(`team.st.${st}`, { d: licenseDaysLeft(m) ?? 0 }) + (when ? ` · ${st === "in" ? t("team.since", { t: when }) : t("team.last", { t: when })}` : "");
    return (
      <div key={m.id} role="button" tabIndex={0} className="opt set-row tm-row" data-testid={`member-${m.name}`} onClick={() => setEdit(m)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEdit(m); } }}>
        <span className={`av tm-av tm-${groupOf(m.role)}`} aria-hidden>{initials(m.name)}</span>
        <span className="g tm-who"><b>{m.name}</b>
          <span className="cap">{ta(`role.${m.role}`)}{m.skills.length ? ` · ${m.skills.join(", ")}` : ""}</span></span>
        <span className={`tm-st${tone ? ` is-${tone}` : ""}`} data-testid="member-status">{tone && <StatusIcon tone={tone} size={16} />}<span>{word}</span></span>
        {st === "invited" && <Button size="sm" className="tm-act" data-testid="row-text-invite" onClick={(e) => { e.stopPropagation(); void quickText(m); }}>{t("m.textInvite")}</Button>}
        <span className="tm-pay">{m.role === "owner" ? "" : payLabel(m)}</span>
        <span className="cap tm-go" aria-hidden>›</span>
      </div>
    );
  };

  return (
    <>
      <div className="tm-tiles" data-testid="team-tiles">
        <div className="tm-tile tm-total"><b>{team.length}</b><span className="cap">{t("team.people")}</span></div>
        {tiles.filter((x) => x.show).map((x) => (
          <button key={x.f} type="button" className={`tm-tile${filter === x.f ? " on" : ""}`} aria-pressed={filter === x.f} data-testid={`tile-${x.f}`} onClick={() => pick(x.f)}>
            <b>{x.n > 0 && <StatusIcon tone={x.tone} size={18} />}{x.n}</b><span className="cap">{t(`team.tile.${x.f}`)}</span>
          </button>
        ))}
      </div>
      <div className="tm-bar">
        {(["all", "tech", "desk"] as const).map((f) => <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>{t(`team.f.${f}`)} {count(f)}</Chip>)}
        {!["all", "tech", "desk"].includes(filter) && <Chip on onClick={() => setFilter("all")}>{t(`team.tile.${filter}`)} ✕</Chip>}
        <span style={{ flex: 1 }} />
        <input className="inp tm-search" type="search" placeholder={t("team.search")} aria-label={t("team.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {grouped
        ? TEAM_GROUPS.map((g) => {
            const list = shown.filter((m) => groupOf(m.role) === g);
            return list.length ? (
              <section key={g} className="tm-group">
                <div className="tm-gh"><span className="eyebrow">{t(`team.g.${g}`)}</span><span className="cap">{list.length}</span></div>
                <ListGroup>{list.map(row)}</ListGroup>
              </section>
            ) : null;
          })
        : <ListGroup>{shown.map(row)}{!shown.length && <div className="row"><span className="cap">{t("team.none")}</span></div>}</ListGroup>}
      {a.demo && <div className="demo">{t("demo")}</div>}
      {edit && <MemberDrawer a={a} m={edit} onClose={() => setEdit(null)}
        onSaved={(x, invite) => {
          setEdit(null);
          if (a.demo) setTeam((cur) => { const list = cur ?? []; return x.id && list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, { ...x, id: `d-${Date.now()}`, invite: invite ?? "DEMO42" }]; });
          else void load();
          if (invite && !a.demo) {
            // Text the invite right away (PolishOS number); Copy link in the drawer stays as the backup.
            say(t("team.addedInvite", { name: x.name }));
            textInvite(invite)
              .then((r) => say(r.status === "sent" || r.status === "delivered" ? t("team.inviteTexted", { name: x.name }) : t("team.inviteNotTexted", { why: textLine(r) })))
              .catch((e) => say(t("team.inviteNotTexted", { why: (e as Error).message })));
          } else say(invite ? t("team.addedInvite", { name: x.name }) : t("team.saved"));
        }}
        onChanged={(msg) => { setEdit(null); say(msg); if (!a.demo) void load(); }} />}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}

function MemberDrawer({ a, m, onClose, onSaved, onChanged }: { a: Access; m: Member; onClose: () => void; onSaved: (x: Member, invite?: string) => void; onChanged: (msg: string) => void }) {
  const t = useTranslations("settings");
  const ta = useTranslations("account");
  const [x, setX] = useState<Member>({ ...m, phone: m.phone ? fmtPhone(m.phone.replace(/^\+1/, "")) : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isNew = !m.id;
  const isOwnerRow = m.role === "owner";
  const set = (p: Partial<Member>) => setX((c) => ({ ...c, ...p }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((y) => y !== v) : [...list, v]);
  const canSave = x.name.trim() && phoneOk(x.phone);
  const link = (code: string) => `${location.origin}/join/${code}`;
  const noPin = !isNew && m.joined && !m.hasPin;
  // PIN help for someone who joined (owner's own row: owner only). Two ways:
  // 1) at the desk: "Make a new PIN now" → they type it on this screen twice → admin_set_pin (the owner never sees it);
  // 2) not here: personal one-time link /t/pin?c=<code> (pin_link_make), copied or texted; they sign in with their phone.
  const canPin = !isNew && m.joined && (!isOwnerRow || a.owner);
  const [pinLinkUrl, setPinLinkUrl] = useState("");
  const makePinLink = async () => {
    const code = a.demo ? "DEMO42" : await rpc<string>("pin_link_make", { p_membership: m.id });
    const url = `${location.origin}/t/pin?c=${code}`;
    setPinLinkUrl(url);
    return { code, url };
  };
  const pinText = async () => {
    if (a.demo) return t("m.textDemo");
    try {
      const { code } = await makePinLink();
      const r = await textPinLink(code).catch((e: Error) => ({ status: "error", error: e.message }) as SendReply);
      return r.status === "sent" || r.status === "queued" || r.status === "delivered" ? t("m.pinTexted", { name: m.name })
        : t("m.pinNotTexted", { why: r.status === "error" ? r.error ?? "" : r.duplicate ? t("m.textAgain") : textLine(r) });
    } catch (e) { return (e as Error).message; }
  };
  const copyPin = async () => {
    try {
      const { url } = await makePinLink();
      const ok = await navigator.clipboard?.writeText(url).then(() => true, () => false);
      setTextMsg(ok ? t("m.pinCopied") : t("m.pinCopyHand"));
    } catch (e) { setTextMsg((e as Error).message); }
  };
  const ruleLen = cachedRules(a.salonId).length;
  const [deskPin, setDeskPin] = useState<"" | "one" | "two">("");
  const [deskFirst, setDeskFirst] = useState("");
  const [deskErr, setDeskErr] = useState("");
  const deskDone = async (pin: string) => {
    setDeskErr("");
    if (deskPin === "one") {
      if (pinProblem(pin, ruleLen)) return setDeskErr(t("m.pinWeak"));
      setDeskFirst(pin); setDeskPin("two"); return;
    }
    if (pin !== deskFirst) { setDeskErr(t("m.pinNoMatch")); setDeskFirst(""); setDeskPin("one"); return; }
    try {
      if (!a.demo) await rpc("admin_set_pin", { p_membership: m.id, p_pin: pin });
      onChanged(t("m.pinSetNow", { name: m.name }));
    } catch (e) { setDeskErr((e as Error).message.includes("weak") ? t("m.pinWeak") : (e as Error).message); setDeskFirst(""); setDeskPin("one"); }
  };

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const body = { ...x, phone: e164(x.phone) };
      if (a.demo) { onSaved(body, isNew ? "DEMO42" : undefined); return; }
      const r = await rpc<{ id: string; invite: string | null }>("team_save", { p: savePayload(a.salonId, body, a.owner) });
      onSaved({ ...body, id: r.id }, r.invite ?? undefined);
    } catch (e) { setErr(/duplicate|unique/i.test((e as Error).message) ? t("m.phoneTaken") : (e as Error).message); } finally { setBusy(false); }
  };
  const act = async (fn: string, msg: string) => {
    if (a.demo) return onChanged(msg);
    try { await rpc(fn, { p_membership: m.id }); onChanged(msg); } catch (e) { setErr((e as Error).message); }
  };
  const [textMsg, setTextMsg] = useState("");
  const sendText = async () => {
    setTextMsg(t("m.texting"));
    try {
      // A fresh code each time an old one ended; the same code is never texted twice.
      const code = a.demo ? "DEMO42" : m.invite ?? await rpc<string>("team_invite", { p_membership: m.id });
      if (a.demo) { setTextMsg(t("m.textDemo")); return; }
      let r = await textInvite(code).catch((e: Error) => ({ status: "error", error: e.message }) as SendReply);
      if (r.status === "error" && /ended/.test(r.error ?? "")) r = await textInvite(await rpc<string>("team_invite", { p_membership: m.id }));
      setTextMsg(r.status === "error" ? r.error ?? "" : r.duplicate ? t("m.textAgain") : textLine(r));
    } catch (e) { setTextMsg((e as Error).message); }
  };
  const newInvite = async () => {
    try {
      const code = a.demo ? "DEMO42" : await rpc<string>("team_invite", { p_membership: m.id });
      await navigator.clipboard?.writeText(link(code)).catch(() => {});
      onChanged(t("m.inviteCopied"));
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <Drawer title={isNew ? t("team.add") : x.name} onClose={onClose}
      footer={<><Button onClick={onClose}>{t("m.cancel")}</Button><Button variant="primary" block data-testid="member-save" disabled={!canSave || busy} onClick={() => void save()}>{isNew ? t("m.addInvite") : t("m.save")}</Button></>}>
      {!isNew && !m.joined && (
        <div className="note" data-testid="invite-box">{t("m.waiting")}{m.invite ? <> · <code>{link(m.invite)}</code></> : null}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="primary" data-testid="text-invite" onClick={() => void sendText()}>{t("m.textInvite")}</Button>
            <Button size="sm" onClick={() => void newInvite()}>{t("m.copyInvite")}</Button></div>
          {textMsg && <div className="cap" role="status" style={{ marginTop: 6 }}>{textMsg}</div>}</div>
      )}
      {canPin && (
        <div className={noPin ? "note set-warn-note" : "note set-pin-note"} data-testid="pin-box">{noPin ? t("m.noPinBox") : t("m.pinBox")}
          {!deskPin ? <>
            <div className="cap" style={{ marginTop: 4 }}>{t("m.pinHow")}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="primary" data-testid="pin-now" onClick={() => { setDeskErr(""); setDeskPin("one"); }}>{t("m.pinNow")}</Button>
              <Button size="sm" data-testid="text-pin" onClick={() => { setTextMsg(t("m.texting")); void pinText().then(setTextMsg); }}>{t("m.textPin")}</Button>
              <Button size="sm" data-testid="copy-pin" onClick={() => void copyPin()}>{t("m.copyPin")}</Button></div>
            {pinLinkUrl && <div className="cap" style={{ marginTop: 6 }}><code style={{ userSelect: "all", wordBreak: "break-all" }}>{pinLinkUrl}</code></div>}
            {textMsg && <div className="cap" role="status" style={{ marginTop: 6 }}>{textMsg}</div>}
          </> : (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink)" }}>
              <b style={{ textAlign: "center" }}>{deskPin === "one" ? t("m.pinNowOne", { name: m.name, n: ruleLen }) : t("m.pinNowTwo")}</b>
              <div className="cap" style={{ textAlign: "center" }}>{t("m.pinNowHand")}</div>
              <PinKeypad key={deskPin} length={ruleLen} error={deskErr} onDone={(p) => void deskDone(p)} />
              <Button size="sm" variant="ghost" onClick={() => { setDeskPin(""); setDeskFirst(""); }}>{t("m.cancel")}</Button>
            </div>
          )}
        </div>
      )}
      {/* 1 · Who: name + how to reach them */}
      <section className="set-sec">
        <div className="set-sec-h">{t("m.secWho")}</div>
        <div className="set-two">
          <Field id="m-name" label={t("m.name")} value={x.name} onChange={(e) => set({ name: e.target.value })} />
          <Field id="m-nick" label={t("m.nickname")} value={x.nickname ?? ""} onChange={(e) => set({ nickname: e.target.value })} />
        </div>
        <Field id="m-phone" label={t("m.phone")} inputMode="tel" value={x.phone} disabled={!isNew && m.joined}
          hint={!isNew && m.joined ? t("m.phoneFixed") : undefined} onChange={(e) => set({ phone: fmtPhone(e.target.value) })} />
        <Field id="m-email" label={t("m.email")} type="email" value={x.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        <div><span className="lbl">{t("m.language")}</span>
          <div className="set-chips"><Chip on={x.language === "en"} onClick={() => set({ language: "en" })}>English</Chip><Chip on={x.language === "vi"} onClick={() => set({ language: "vi" })}>Tiếng Việt</Chip></div></div>
      </section>

      {/* 2 · Job: role, days, skills, license */}
      <section className="set-sec">
        <div className="set-sec-h">{t("m.secJob")}</div>
        {!isOwnerRow && (
          <div><span className="lbl">{t("m.role")}</span>
            <div className="set-chips">{(["manager", "front_desk", "tech"] as Role[]).map((r) => <Chip key={r} on={x.role === r} onClick={() => set({ role: r })}>{ta(`role.${r}`)}</Chip>)}</div>
            <div className="cap" style={{ marginTop: 6 }}>{t(`m.roleNote.${x.role}`)}</div></div>
        )}
        <div><span className="lbl">{t("m.workdays")}</span>
          <div className="set-chips">{DAYS.map((d, i) => <Chip key={d} on={x.workdays.includes(i)} onClick={() => set({ workdays: toggle(x.workdays, i).sort() })}>{t(`days.${i}`)}</Chip>)}</div></div>
        {x.role === "tech" && <>
          <div><span className="lbl">{t("m.skills")}</span>
            <div className="set-chips">{SKILLS.map((s) => <Chip key={s} on={x.skills.includes(s)} onClick={() => set({ skills: toggle(x.skills, s) })}>{s}</Chip>)}</div>
            <div className="cap" style={{ marginTop: 6 }}>{t("m.skillsHint")}</div></div>
          <div className="set-two">
            <Field id="m-lic" label={t("m.licenseNo")} value={x.licenseNo ?? ""} onChange={(e) => set({ licenseNo: e.target.value })} />
            <DateField id="m-licx" label={t("m.licenseExpires")} value={x.licenseExpires ?? ""} clearable onChange={(v) => set({ licenseExpires: v || null })} />
          </div>
        </>}
      </section>

      {/* 3 · Pay */}
      {!isOwnerRow && <section className="set-sec">
        <div className="set-sec-h">{t("m.pay")}</div>
        {a.owner ? <>
          <div className="set-chips">{(["commission", "hourly", "booth_rent"] as PayType[]).map((p) => <Chip key={p} on={x.payType === p} onClick={() => set({ payType: p })}>{t(`m.payType.${p}`)}</Chip>)}</div>
          <div className="set-two">
            {x.payType === "commission" && <Field id="m-pct" label={t("m.commission")} inputMode="decimal" value={x.commissionPct ?? ""} onChange={(e) => set({ commissionPct: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) })} />}
            {x.payType === "hourly" && <Field id="m-hourly" label={t("m.hourly")} inputMode="decimal" value={x.hourlyCents == null ? "" : (x.hourlyCents / 100).toFixed(2)} onChange={(e) => set({ hourlyCents: e.target.value === "" ? null : Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 100) })} />}
            {x.payType !== "booth_rent" && <Field id="m-check" label={t("m.checkPct")} inputMode="numeric" value={x.checkPct} hint={t("m.checkHint", { cash: 100 - x.checkPct })}
              onChange={(e) => set({ checkPct: Math.max(0, Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0)) })} />}
          </div>
          <div className="cap">{t("m.tips")}</div>
        </> : <div className="cap">{payLabel(x)} · {t("m.payOwnerOnly")}</div>}
      </section>}

      {/* 4 · More (optional): folded unless something is filled */}
      <details className="set-sec set-more" open={!!(m.startDate || m.birthday || m.emergency)}>
        <summary className="set-sec-h">{t("m.more")}</summary>
        <div className="set-two">
          <DateField id="m-start" label={t("m.start")} value={x.startDate ?? ""} clearable onChange={(v) => set({ startDate: v || null })} />
          <Field id="m-bday" label={t("m.birthday")} placeholder="MM-DD" value={x.birthday ?? ""} onChange={(e) => set({ birthday: e.target.value })} />
        </div>
        <Field id="m-emer" label={t("m.emergency")} placeholder={t("m.emergencyHint")} value={x.emergency ?? ""} onChange={(e) => set({ emergency: e.target.value })} />
      </details>
      {isNew && <div className="cap">{t("m.inviteNote")}</div>}

      {!isNew && (
        <div className="set-actions" aria-label={t("m.secAccount")}>
          {m.hasPin && (!isOwnerRow || a.owner) && <Button data-testid="clear-pin" onClick={() => void act("team_clear_pin", t("m.pinCleared", { name: m.name }))}>{t("m.clearPin")}</Button>}
          {!isOwnerRow && <Button data-testid="member-remove" onClick={() => { if (confirm(t("m.removeAsk", { name: m.name }))) void act("team_archive", t("m.removed", { name: m.name })); }} style={{ color: "var(--orange)" }}>{t("m.remove")}</Button>}
        </div>
      )}
      {err && <p className="hint err" role="alert">{err}</p>}
    </Drawer>
  );
}
