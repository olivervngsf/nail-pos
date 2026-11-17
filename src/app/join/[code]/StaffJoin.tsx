"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStored } from "@/lib/useStored";
import { WEAK_PINS } from "@/lib/onboarding/data";
import PhoneCodeLogin from "@/components/PhoneCodeLogin";
import { ROLE_LABEL, SMS_ON, myMemberships, rpc, type Role } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";

type Invite = { code: string; name: string; role: string; salon: string; owner: string };
type JoinState = {
  step: "invite" | "notme" | "verify" | "lang" | "pin" | "pin2" | "photo" | "done" | "home";
  salonId?: string;
  lang: "English" | "Tiếng Việt";
  clocked: boolean;
};

const T = {
  English: {
    join: (s: string) => `Join ${s}?`, name: "Name", role: "Role", yes: "Yes, this is me", notMe: "Not me",
    thanks: "Thanks for telling us", closed: (o: string) => `This link is now closed. We let ${o} know so they can send it to the right number.`,
    lang: "Your language", langCap: "Only your screens. Clients see their own.", cont: "Continue",
    pin1: "Make a 4-digit PIN", pin1Cap: "You use it to clock in and check out. Not 1234 or 1111.", pin2: "Type it again", pin2Cap: "To be sure.",
    weak: "Too easy to guess. Try another.", nomatch: "Didn't match. Start again.",
    photo: "Add your photo", photoCap: "Clients and the front desk see it on the calendar. You can change it any time.",
    take: "Take a photo", lib: "Choose from library", skip: "Skip",
    set: (n: string) => `You're all set, ${n}`, clockHow: "How to clock in", clockWhere: "At the salon: this phone, or the front desk iPad with your PIN",
    nothing: "Nothing else to do now. You can close this and come back any time.", home: "Open my Home",
    hi: (n: string) => `Hi ${n}`, clockIn: "Clock in", clocked: "Clocked in", earn: "Today's earnings", clients: "My clients today", me: "My photo · language · PIN",
    clockNote: "Clock-in works at the salon only (salon Wi-Fi or location).",
    tabs: ["Home", "Schedule", "Book", "Earnings", "Me"], back: "‹ Back", yourPin: "Your PIN", photoT: "Photo",
  },
  "Tiếng Việt": {
    join: (s: string) => `Tham gia ${s}?`, name: "Tên", role: "Vai trò", yes: "Đúng, là tôi", notMe: "Không phải tôi",
    thanks: "Cảm ơn bạn đã báo", closed: (o: string) => `Đường link này đã đóng. Chúng tôi đã báo ${o} để gửi đúng số.`,
    lang: "Ngôn ngữ của bạn", langCap: "Chỉ màn hình của bạn. Khách thấy ngôn ngữ của họ.", cont: "Tiếp tục",
    pin1: "Tạo mã PIN 4 số", pin1Cap: "Dùng để chấm công và tính tiền. Không dùng 1234 hay 1111.", pin2: "Nhập lại", pin2Cap: "Để chắc chắn.",
    weak: "Dễ đoán quá. Thử số khác.", nomatch: "Không khớp. Làm lại.",
    photo: "Thêm ảnh của bạn", photoCap: "Khách và quầy thấy ảnh trên lịch. Đổi lúc nào cũng được.",
    take: "Chụp ảnh", lib: "Chọn từ thư viện", skip: "Bỏ qua",
    set: (n: string) => `Xong rồi, ${n}`, clockHow: "Cách chấm công", clockWhere: "Tại tiệm: điện thoại này, hoặc iPad ở quầy với mã PIN",
    nothing: "Không cần làm gì thêm. Bạn có thể đóng và quay lại bất cứ lúc nào.", home: "Mở trang chính",
    hi: (n: string) => `Chào ${n}`, clockIn: "Chấm công vào", clocked: "Đã chấm công", earn: "Thu nhập hôm nay", clients: "Khách của tôi hôm nay", me: "Ảnh · ngôn ngữ · PIN",
    clockNote: "Chỉ chấm công được khi ở tiệm (Wi-Fi hoặc vị trí tiệm).",
    tabs: ["Chính", "Lịch", "Đặt hẹn", "Thu nhập", "Tôi"], back: "‹ Quay lại", yourPin: "Mã PIN", photoT: "Ảnh",
  },
} as const;

type DbInvite = { salon_name: string; display_name: string; role: Role; owner_name: string | null; phone_last4: string; status: "open" | "used" | "expired" };

export default function StaffJoin({ invite: linkInvite }: { invite: Invite }) {
  const router = useRouter();
  const [db, setDb] = useState<DbInvite | null | undefined>(SMS_ON ? undefined : null);
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (!SMS_ON) return;
    void rpc<DbInvite[]>("get_invite", { p_code: linkInvite.code }).then((r) => setDb(r[0] ?? null)).catch(() => setDb(null));
  }, [linkInvite.code]);
  const invite: Invite = db
    ? { code: linkInvite.code, name: db.display_name, role: ROLE_LABEL[db.role], salon: db.salon_name, owner: (db.owner_name ?? "The owner").split(" ")[0] }
    : linkInvite;
  const [s, setS, { ready }] = useStored<JoinState>(`nailpos.join.${invite.code}`, () => ({ step: "invite", lang: "English", clocked: false }));
  const [pin, setPin] = useState("");
  const [pin1, setPin1] = useState("");
  const [err, setErr] = useState("");
  const t = T[s.lang];
  const first = invite.name.split(" ")[0] || invite.name;
  const go = (step: JoinState["step"]) => { setS((p) => ({ ...p, step })); window.scrollTo(0, 0); };

  if (!ready) return <div className="phone" aria-busy="true" />;

  const Shell = ({ title, back, children, tabs }: { title: string; back?: JoinState["step"]; children: React.ReactNode; tabs?: boolean }) => (
    <div className="phone">
      <div className="pbar">
        {back ? <button className="btn ghost sm" type="button" onClick={() => go(back)}>{t.back}</button> : <span style={{ width: 70 }} />}
        <span>{title}</span><span style={{ width: 70 }} />
      </div>
      <div className="pbody in" key={s.step}>{children}</div>
      {tabs && <nav className="ptabs">{t.tabs.map((x, i) => <button key={x} type="button" className={i === 0 ? "on" : ""}>{x}</button>)}</nav>}
    </div>
  );

  const press = (k: string) => {
    if (k === "del") { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const v = pin + k;
    setPin(v); setErr("");
    if (v.length < 4) return;
    setTimeout(() => {
      if (s.step === "pin") {
        if (WEAK_PINS.includes(v)) { setErr(t.weak); setPin(""); }
        else { setPin1(v); setPin(""); go("pin2"); }
      } else if (v === pin1) {
        setPin("");
        if (!SMS_ON) return go("photo");
        void (async () => {
          try {
            await rpc("set_my_pin", { p_salon: s.salonId, p_pin: v });
            const c = getSupabase(); const uid = (await c?.auth.getUser())?.data.user?.id;
            if (c && uid) await c.from("people").update({ language: s.lang === "Tiếng Việt" ? "vi" : "en" }).eq("auth_user_id", uid);
            go("photo");
          } catch (e) { setErr((e as Error).message.includes("weak") ? t.weak : (e as Error).message); setPin1(""); go("pin"); }
        })();
      }
      else { setErr(t.nomatch); setPin(""); setPin1(""); go("pin"); }
    }, 200);
  };

  if (SMS_ON && db === undefined) return <div className="phone" aria-busy="true" />;
  if (SMS_ON && db === null && s.step === "invite") return <Shell title="Nail POS"><h1 className="h2">This invite link doesn&apos;t work</h1><div className="cap lead">Ask the salon owner to send it again.</div></Shell>;
  if (SMS_ON && db && db.status !== "open" && s.step === "invite") return <Shell title="Nail POS">
    <h1 className="h2">{db.status === "expired" ? "This invite has ended" : "You already joined"}</h1>
    <div className="cap lead">{db.status === "expired" ? "Ask the owner to send a new one." : "Sign in with your phone number."}</div>
    {db.status === "used" && <button className="btn primary block" type="button" onClick={() => router.push("/login")}>Sign in</button>}
  </Shell>;

  switch (s.step) {
    case "verify":
      return <Shell title="Nail POS" back="invite">
        <PhoneCodeLogin phone={phone} setPhone={setPhone} title={s.lang === "Tiếng Việt" ? "Xác nhận số điện thoại" : "Confirm your phone"}
          lead={`${s.lang === "Tiếng Việt" ? "Số mà chủ tiệm đã nhập, kết thúc bằng" : "The number the owner added, ending in"} ${db?.phone_last4 ?? ""}.`}
          onDone={async () => {
            const mine = await myMemberships();
            const m = mine.find((x) => x.salon_name === invite.salon) ?? mine[0];
            if (!m) { setErr("This phone isn't on the invite. Use the number the owner added."); return; }
            setS((p) => ({ ...p, salonId: m.salon_id }));
            go("lang");
          }} />
        {err && <div className="hint err" role="alert">{err}</div>}
      </Shell>;
    case "invite":
      return <Shell title="Nail POS">
        <div className="bubble">{invite.salon}: Hi {first}! {invite.owner} added you to Nail POS.</div>
        <h1 className="h2">{t.join(invite.salon)}</h1>
        <div className="group">
          <div className="row"><span className="g">{t.name}</span><b>{invite.name}</b></div>
          <div className="row"><span className="g">{t.role}</span><b>{invite.role}</b></div>
        </div>
        <button className="btn primary block" type="button" onClick={() => go(SMS_ON ? "verify" : "lang")}>{t.yes}</button>
        <button className="btn ghost block" type="button" onClick={() => go("notme")}>{t.notMe}</button>
      </Shell>;
    case "notme":
      return <Shell title="Nail POS">
        <h1 className="h2">{t.thanks}</h1>
        <div className="cap lead" style={{ lineHeight: "22px" }}>{t.closed(invite.owner)}</div>
      </Shell>;
    case "lang":
      return <Shell title="Nail POS" back="invite">
        <h1 className="h2">{t.lang} · Ngôn ngữ</h1>
        <div className="cap">{t.langCap}</div>
        <div className="group">
          {(["English", "Tiếng Việt"] as const).map((l) => (
            <button key={l} type="button" className={`opt ${s.lang === l ? "on" : ""}`} aria-pressed={s.lang === l} onClick={() => setS((p) => ({ ...p, lang: l }))}>
              <span className="g">{l}</span><span>{s.lang === l ? "✓" : ""}</span>
            </button>
          ))}
        </div>
        <button className="btn primary block" type="button" onClick={() => { setPin(""); setErr(""); go("pin"); }}>{t.cont}</button>
      </Shell>;
    case "pin":
    case "pin2":
      return <Shell title={t.yourPin} back="lang">
        <h1 className="h2" style={{ textAlign: "center" }}>{s.step === "pin" ? t.pin1 : t.pin2}</h1>
        <div className="cap" style={{ textAlign: "center" }}>{s.step === "pin" ? t.pin1Cap : t.pin2Cap}</div>
        <div className="dots" style={{ margin: "8px 0 4px" }} aria-label={`${pin.length} of 4 digits`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "on" : ""} />)}</div>
        <div className="hint err" style={{ textAlign: "center", minHeight: 18 }} role="alert">{err}</div>
        <div className="keys">
          {"123456789".split("").map((k) => <button key={k} className="key" type="button" onClick={() => press(k)}>{k}</button>)}
          <span />
          <button className="key" type="button" onClick={() => press("0")}>0</button>
          <button className="key" type="button" style={{ fontSize: 16 }} aria-label="Delete" onClick={() => press("del")}>⌫</button>
        </div>
      </Shell>;
    case "photo":
      return <Shell title={t.photoT} back="pin">
        <h1 className="h2" style={{ textAlign: "center" }}>{t.photo}</h1>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: "#E9D7CB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 700, color: "#8C6A5A", alignSelf: "center" }}>{first[0]}</div>
        <div className="cap" style={{ textAlign: "center" }}>{t.photoCap}</div>
        <label className="btn block">{t.take}<input type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={() => go("done")} /></label>
        <label className="btn block">{t.lib}<input type="file" accept="image/*" style={{ display: "none" }} onChange={() => go("done")} /></label>
        <button className="btn ghost block" type="button" onClick={() => go("done")}>{t.skip}</button>
      </Shell>;
    case "done":
      return <Shell title="Nail POS">
        <div className="okmark" style={{ alignSelf: "center" }}>✓</div>
        <h1 className="h2" style={{ textAlign: "center" }}>{t.set(first)}</h1>
        <div className="cap lead" style={{ textAlign: "center" }}>{invite.salon} · {invite.role} · {s.lang}</div>
        <div className="group"><div className="row m"><span className="g"><span className="cap">{t.clockHow}</span><b style={{ fontWeight: 600 }}>{t.clockWhere}</b></span></div></div>
        <div className="cap">{t.nothing}</div>
        <button className="btn primary block" type="button" onClick={() => (SMS_ON ? router.push("/t") : go("home"))}>{t.home}</button>
      </Shell>;
    case "home":
      return <Shell title={t.tabs[0]} tabs>
        <h1 className="h2">{t.hi(first)}</h1>
        {s.clocked ? (
          <div className="card pad" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <div className="okmark" style={{ width: 40, height: 40, fontSize: 20 }}>✓</div>
            <div><b>{t.clocked}</b><div className="cap">{invite.salon}</div></div>
          </div>
        ) : (
          <div className="card pad">
            <button className="btn primary block" type="button" onClick={() => setS((p) => ({ ...p, clocked: true }))}>{t.clockIn}</button>
            <div className="cap">{t.clockNote}</div>
          </div>
        )}
        <div className="group">
          <div className="row m"><span className="g">{t.earn}</span><b>$0.00</b></div>
          <div className="row m"><span className="g">{t.clients}</span><b>—</b></div>
          <div className="row m"><span className="g">{t.me}</span><span className="cap">›</span></div>
        </div>
        <div className="demo">Test version: PIN and clock-in stay on this phone until logins go live.</div>
      </Shell>;
  }
}
