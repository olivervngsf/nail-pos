"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { enqueue } from "@/lib/offline/outbox";
import { formatCents } from "@/lib/money";
import { useLang } from "@/components/AppProviders";
import {
  Avatar, Banner, Button, Card, Chip, DataTable, Drawer, Empty, Field, LeftMenu, ListGroup, MessageBubble, MiniBars,
  OfflineBanner, PhoneBar, PhoneTabs, PinKeypad, ProgressBar, Row, Segmented, Sheet, StatTile, StatusPill, Stepper,
  Switch, SyncPill, Tag, Toast, TopBar,
} from "@/components/kit";

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="kit-sec"><div className="eyebrow">{title}</div>{children}</section>;
}

export default function KitPage() {
  const t = useTranslations("kit");
  const tl = useTranslations("lang");
  const { lang, setLang } = useLang();
  const [seg, setSeg] = useState<"day" | "week" | "month">("day");
  const [chip, setChip] = useState("Gel");
  const [sw, setSw] = useState(true);
  const [tip, setTip] = useState(1500);
  const [pinMsg, setPinMsg] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(false);
  const [tab, setTab] = useState<"home" | "schedule" | "earnings" | "me">("home");
  const [stat, setStat] = useState(0);
  const [applied, setApplied] = useState(0);

  const tag = typeof window === "undefined" ? "kit" : new URLSearchParams(window.location.search).get("tag") ?? "kit";
  const refreshApplied = () => fetch(`/api/ping?tag=${encodeURIComponent(tag)}`).then((r) => r.json()).then((d) => setApplied(d.applied)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refreshApplied(); }, []);

  return (
    <div className="app">
      <LeftMenu active="Today" salonInitials="MN" me="M" />
      <div className="col">
        <TopBar title={t("title")}>
          <Segmented label={tl("label")} value={lang} onChange={setLang} options={[{ value: "en", label: tl("en") }, { value: "vi", label: tl("vi") }]} />
          <SyncPill />
        </TopBar>
        <OfflineBanner />
        <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 28, maxWidth: 980 }}>
          <div><h1 className="h1">{t("title")}</h1><p className="cap lead">{t("lead")}</p></div>

          <Sec title={t("offlineTest")}>
            <Card pad>
              <div className="cap">{t("offlineLead")}</div>
              <div className="kit-row">
                <Button variant="primary" data-testid="save-test" onClick={async () => { await enqueue("dev.ping", { tag, at: Date.now() }); setTimeout(refreshApplied, 300); }}>{t("saveTest")}</Button>
                <SyncPill />
                <span className="cap" data-testid="applied">{t("sent", { count: applied })}</span>
                <Button size="sm" onClick={refreshApplied}>↻</Button>
              </div>
            </Card>
          </Sec>

          <Sec title="Type + money">
            <div className="kit-row"><span className="h1">Heading 1</span><span className="h2">Heading 2</span><span className="money">{formatCents(128400)}</span><span className="cap">Caption</span><span className="eyebrow">Eyebrow</span></div>
          </Sec>

          <Sec title="Buttons · Segmented · Chips · Switch · Stepper">
            <div className="kit-row">
              <Button variant="primary">Charge $83.00</Button><Button>Save, charge later</Button><Button variant="ghost">Cancel</Button><Button size="sm">Small</Button>
            </div>
            <div className="kit-row">
              <Segmented label="View" value={seg} onChange={setSeg} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
              {["Gel", "Acrylic", "Pedicure"].map((c) => <Chip key={c} on={chip === c} onClick={() => setChip(c)}>{c}</Chip>)}
              <Chip suggested>Suggested</Chip>
              <Switch label="Sell gift cards" on={sw} onChange={setSw} />
              <Stepper label="tip" value={tip} step={500} min={0} format={formatCents} onChange={setTip} />
            </div>
          </Sec>

          <Sec title="Fields">
            <div className="grid2">
              <Field id="f1" label="Client phone" placeholder="(408) 555-0110" hint="Phone first, then name." />
              <Field id="f2" label="Price" defaultValue="6.555" error="Up to 2 decimals." />
            </div>
          </Sec>

          <Sec title="Groups + rows · tags · pills · avatar">
            <ListGroup>
              <Row size="m" title={<b>Gel manicure</b>} sub="Linh · 45 min" right={<span className="num">$45.00</span>} />
              <Row title="Discount · Regular client" className="minus" right={<span className="num">−$5.00</span>} />
              <Row size="s" title={<span style={{ display: "flex", gap: 8, alignItems: "center" }}><Avatar name="Kim Le" />Kim Le</span>} right={<Tag tone="jade">Free now</Tag>} />
            </ListGroup>
            <div className="kit-row"><StatusPill tone="ok">Connected</StatusPill><StatusPill tone="warn">3 tickets waiting</StatusPill><StatusPill>Neutral</StatusPill><Tag>Regular</Tag><Avatar name="Mai Nguyen" large /></div>
          </Sec>

          <Sec title="Stats · progress · table · mini bars">
            <div className="grid3">
              <StatTile label="Sales today" value="$1,284" trend={{ text: "12% vs last Mon", up: true }} on={stat === 0} onClick={() => setStat(0)} />
              <StatTile label="Avg ticket" value="$58" on={stat === 1} onClick={() => setStat(1)} />
              <StatTile label="Sales / staff hr" value="$41" trend={{ text: "$2", up: false }} on={stat === 2} onClick={() => setStat(2)} />
            </div>
            <ProgressBar label="To next reward" value={0.72} />
            <Card pad><DataTable head={["Staff", "Sales", "Hours", "Tips"]} rows={[["Kim", "$2,310", "38", "$362"], ["Linh", "$1,980", "36", "$301"]]} /></Card>
            <Card pad><MiniBars label="Sales by hour, today vs last Monday" bars={[{ label: "10", now: 0.3, last: 0.4 }, { label: "12", now: 0.9, last: 0.7 }, { label: "2", now: 0.6, last: 0.5 }, { label: "4", now: 0.4, last: 0.5 }]} /></Card>
          </Sec>

          <Sec title="PIN keypad · message · empty · banner">
            <div className="grid3">
              <Card pad><PinKeypad error={pinMsg} onDone={(p) => setPinMsg(p === "1234" ? "Too easy to guess" : `PIN ${p} OK`)} /></Card>
              <Card pad><MessageBubble>Mai Nails: Hi Lan! Your gel mani with Kim is tomorrow at 2:00 PM. Reply C to confirm.</MessageBubble></Card>
              <Card><Empty title="Nothing needs you right now"><span className="cap">Done items slide away.</span></Empty></Card>
            </div>
            <Banner>No internet. Everything saves on this device.</Banner>
            <Banner tone="ok">Back online · 3 changes sent.</Banner>
          </Sec>

          <Sec title="Drawer · sheet · toast">
            <div className="kit-row"><Button onClick={() => setDrawer(true)}>Open drawer</Button><Button onClick={() => setSheet(true)}>Open sheet</Button><Button onClick={() => { setToast(true); setTimeout(() => setToast(false), 3000); }}>Show toast</Button></div>
          </Sec>

          <Sec title="Phone bar + tabs">
            <div className="phone" style={{ minHeight: 0, maxWidth: 390, margin: 0, border: "1px solid var(--line)", borderRadius: 18, overflow: "hidden" }}>
              <PhoneBar title="Home" />
              <div className="pbody"><span className="cap">Tab: {tab}</span></div>
              <PhoneTabs value={tab} onChange={setTab} tabs={[{ value: "home", label: "Home" }, { value: "schedule", label: "Schedule" }, { value: "earnings", label: "Earnings" }, { value: "me", label: "Me" }]} />
            </div>
          </Sec>
        </main>
      </div>
      {drawer && <Drawer title="Add staff" onClose={() => setDrawer(false)} footer={<><Button variant="ghost" onClick={() => setDrawer(false)}>Cancel</Button><Button variant="primary" style={{ flex: 1 }}>Send invite</Button></>}><Field id="d1" label="Name" /></Drawer>}
      {sheet && <Sheet label="Tip" onClose={() => setSheet(false)}><div className="h2">Add a tip</div><Button variant="primary" block onClick={() => setSheet(false)}>Done</Button></Sheet>}
      {toast && <Toast action={{ label: "Undo", onClick: () => setToast(false) }}>Booked · Lan with Kim at 2:00 PM</Toast>}
    </div>
  );
}
