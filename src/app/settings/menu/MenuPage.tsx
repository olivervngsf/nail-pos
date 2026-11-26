"use client";
// Settings → Service menu (Nov 25): the menu from setup step 3, changed later. Tap a service to change group, name,
// minutes, price, "from" price, online booking; + Add service; Remove hides it (never deleted, old tickets keep it).
// Owner/manager only (menu_service_save / menu_service_remove, logged). Checkout + calendar pick it up on next load.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banner, Button, Drawer, Switch, Toast } from "@/components/kit";
import { useLang } from "@/components/AppProviders";
import { rpc } from "@/lib/auth";
import { fmtPrice } from "@/lib/onboarding/data";
import { groupMenu, itemProblem, sampleInfo, type MenuItem, type SalonInfo } from "@/lib/salonInfo";
import SettingsShell, { type Access } from "../SettingsShell";

const blank = (cat = ""): MenuItem => ({ id: "", cat, name: "", minutes: 30, cents: 0, from: false, online: true });

export default function MenuPage() {
  const t = useTranslations("settings");
  const [adding, setAdding] = useState(0);
  return (
    <SettingsShell title={t("nav.menu")} actions={<Button variant="primary" onClick={() => setAdding((n) => n + 1)} data-testid="menu-add">+ {t("menuAdd")}</Button>}>
      {(a) => <Menu a={a} adding={adding} />}
    </SettingsShell>
  );
}

function Menu({ a, adding }: { a: Access; adding: number }) {
  const { lang } = useLang();
  const L = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [edit, setEdit] = useState<MenuItem | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  const reload = () => {
    if (a.demo) { setMenu((m) => m ?? sampleInfo().services); return; }
    void rpc<SalonInfo>("salon_info_get", { p_salon: a.salonId }).then((r) => setMenu(r.services ?? [])).catch((e: Error) => setErr(e.message));
  };
  useEffect(reload, [a.demo, a.salonId]);
  useEffect(() => { if (adding) setEdit(blank()); }, [adding]);

  if (!menu) return <div className="card pad" aria-busy="true">{err || L("Loading…", "Đang tải…")}</div>;
  const shown = q.trim() ? menu.filter((m) => `${m.name} ${m.cat}`.toLowerCase().includes(q.trim().toLowerCase())) : menu;
  const groups = groupMenu(shown);

  return (
    <div className="si-page" data-testid="menu-page">
      <div className="si-top">
        <input className="inp" type="search" placeholder={L("Find a service", "Tìm dịch vụ")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={L("Find a service", "Tìm dịch vụ")} />
        <span className="cap">{L(`${menu.length} services`, `${menu.length} dịch vụ`)}</span>
      </div>
      {groups.map(([cat, items]) => (
        <div key={cat} className="si-group">
          <div className="si-gh">
            <span className="eyebrow">{cat}</span>
            <button type="button" className="btn ghost sm" onClick={() => setEdit(blank(cat))}>+ {L("Add", "Thêm")}</button>
          </div>
          <div className="group">
            {items.map((m) => (
              <button key={m.id} type="button" className="opt set-row" onClick={() => setEdit(m)} data-testid="menu-row">
                <span className="g" style={{ flex: 1, minWidth: 0 }}>
                  <b>{m.name}</b>
                  <span className="cap">{m.minutes} min{m.online ? "" : ` · ${L("not on booking page", "không đặt online")}`}</span>
                </span>
                <b className="si-price">{fmtPrice({ priceCents: m.cents, priceFrom: m.from })}</b>
                <span className="cap" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!groups.length && <div className="card pad cap">{L("No service matches.", "Không có dịch vụ nào khớp.")}</div>}
      {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}
      {a.demo && <div className="demo">{L("Test version: changes stay on this screen.", "Bản thử: thay đổi chỉ ở màn hình này.")}</div>}

      {edit && <EditService a={a} item={edit} menu={menu} L={L} onClose={() => setEdit(null)}
        onSaved={(it, removed) => {
          setMenu((m) => removed ? (m ?? []).filter((x) => x.id !== it.id) : (m ?? []).some((x) => x.id === it.id) ? (m ?? []).map((x) => (x.id === it.id ? it : x)) : [...(m ?? []), it]);
          setEdit(null); say(removed ? L("Removed from the menu", "Đã gỡ khỏi bảng dịch vụ") : L("Saved", "Đã lưu"));
        }} />}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function EditService({ a, item, menu, L, onClose, onSaved }: {
  a: Access; item: MenuItem; menu: MenuItem[]; L: (en: string, vi: string) => string; onClose: () => void; onSaved: (it: MenuItem, removed?: boolean) => void;
}) {
  const [it, setIt] = useState(item);
  const [price, setPrice] = useState(item.id ? (item.cents / 100).toFixed(item.cents % 100 ? 2 : 0) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sure, setSure] = useState(false);
  const cents = Math.round(Number(price || "x") * 100);
  const cur = { ...it, cents: Number.isFinite(cents) ? cents : -1 };
  const problem = itemProblem(cur, menu);
  const cats = [...new Set(menu.map((m) => m.cat).filter(Boolean))];
  const msg: Record<string, string> = {
    name: L("Name needed", "Cần tên dịch vụ"), minutes: L("Minutes 5 to 600", "Từ 5 đến 600 phút"),
    price: L("Price needed", "Cần giá"), dup: L("Already on the menu", "Đã có trong bảng dịch vụ"),
  };

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      const id = a.demo ? (it.id || `sample-${Date.now()}`)
        : await rpc<string>("menu_service_save", { p_salon: a.salonId, p: { id: it.id || null, cat: it.cat, name: it.name.trim(), minutes: it.minutes, cents: cur.cents, from: it.from, online: it.online } });
      onSaved({ ...cur, id, name: it.name.trim(), cat: it.cat.trim() || "Other" });
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const remove = async () => {
    setErr(""); setBusy(true);
    try { if (!a.demo) await rpc("menu_service_remove", { p_salon: a.salonId, p_id: it.id }); onSaved(it, true); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Drawer title={it.id ? L("Change service", "Sửa dịch vụ") : L("Add a service", "Thêm dịch vụ")} onClose={onClose}
      footer={<>
        {it.id && (sure
          ? <Button className="si-danger" onClick={() => void remove()} disabled={busy} data-testid="menu-remove-yes">{L("Yes, remove", "Gỡ")}</Button>
          : <Button variant="ghost" onClick={() => setSure(true)} disabled={busy} data-testid="menu-remove">{L("Remove", "Gỡ")}</Button>)}
        <span style={{ flex: 1 }} />
        <Button onClick={onClose}>{L("Cancel", "Huỷ")}</Button>
        <Button variant="primary" onClick={() => void save()} disabled={!!problem || busy} data-testid="menu-save">{busy ? L("Saving…", "Đang lưu…") : L("Save", "Lưu")}</Button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="lbl" htmlFor="ms-name">{L("Service name", "Tên dịch vụ")}</label>
          <input id="ms-name" className="inp" value={it.name} maxLength={80} autoFocus onChange={(e) => setIt({ ...it, name: e.target.value })} data-testid="ms-name" />
        </div>
        <div>
          <label className="lbl" htmlFor="ms-cat">{L("Group", "Nhóm")}</label>
          <input id="ms-cat" className="inp" list="ms-cats" value={it.cat} maxLength={40} placeholder="Manicure" onChange={(e) => setIt({ ...it, cat: e.target.value })} />
          <datalist id="ms-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="si-two">
          <div>
            <label className="lbl" htmlFor="ms-price">{L("Price ($)", "Giá ($)")}</label>
            <input id="ms-price" className="inp" inputMode="decimal" value={price} placeholder="35" onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} data-testid="ms-price" />
          </div>
          <div>
            <label className="lbl" htmlFor="ms-min">{L("Minutes", "Phút")}</label>
            <input id="ms-min" className="inp" inputMode="numeric" value={it.minutes || ""} onChange={(e) => setIt({ ...it, minutes: Number(e.target.value.replace(/\D/g, "")) })} />
          </div>
        </div>
        <div className="row s" style={{ padding: 0 }}>
          <span className="g" style={{ flex: 1 }}>{L("\"From\" price", "Giá \"từ\"")}<span className="cap">{L("Shows $35+; the desk sets the final price.", "Hiện $35+; quầy chốt giá cuối.")}</span></span>
          <Switch on={it.from} onChange={(from) => setIt({ ...it, from })} label={L("From price", "Giá từ")} />
        </div>
        <div className="row s" style={{ padding: 0 }}>
          <span className="g" style={{ flex: 1 }}>{L("On the booking page", "Trên trang đặt hẹn")}<span className="cap">{L("Clients can book it online.", "Khách đặt online được.")}</span></span>
          <Switch on={it.online} onChange={(online) => setIt({ ...it, online })} label={L("On the booking page", "Trên trang đặt hẹn")} />
        </div>
        {problem && (it.name || price) && <div className="hint err">{msg[problem]}</div>}
        {sure && <div className="note">{L("Removed services leave the menu. Old tickets keep them.", "Dịch vụ đã gỡ rời khỏi bảng. Phiếu cũ vẫn giữ.")}</div>}
        {err && <Banner tone="bad" onClose={() => setErr("")}>{err}</Banner>}
      </div>
    </Drawer>
  );
}
