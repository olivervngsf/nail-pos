"use client";

// Desktop checkout: opens from "Ready to pay". Every fee shown before paying.

import { useState } from "react";
import { serviceById, staffById, type Ticket } from "@/lib/data";
import { cardFee, fmt } from "@/lib/money";
import { clientByPhone, useStore } from "@/lib/store";

type Method = "qr" | "link" | "reader" | "cash";

function FakeQR() {
  // Looks like a QR code; not a real one.
  const n = 21;
  const cells: [number, number][] = [];
  let seed = 7;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      seed = (seed * 9301 + 49297) % 233280;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5)) : seed / 233280 > 0.5)
        cells.push([x, y]);
    }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="w-44 h-44 shrink-0 bg-white p-2 rounded-xl border">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#1c1917" />
      ))}
    </svg>
  );
}

export function DeskCheckout({ ticket, close }: { ticket: Ticket; close: () => void }) {
  const { s, actions } = useStore();
  const vi = s.lang === "vi";
  const L = (v: string, e: string) => (vi ? v : e);
  const [tipPct, setTipPct] = useState<number | null>(20);
  const [cashTip, setCashTip] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [given, setGiven] = useState(0);
  const [paid, setPaid] = useState(false);
  const [discount, setDiscount] = useState<"none" | "5" | "10pct">(ticket.discountCents ? "5" : "none");

  const c = clientByPhone(s, ticket.phone);
  const tech = staffById(ticket.techId);
  const sub = ticket.subtotalCents;
  const disc = discount === "5" ? 500 : discount === "10pct" ? Math.round(sub * 0.1) : 0;
  const due = Math.max(0, sub - disc);
  const tip = cashTip ? 0 : Math.round((due * (tipPct ?? 0)) / 100);
  const total = due + tip;
  const fee = method === "cash" ? 0 : cardFee(total);

  const finish = (receipt: Ticket["receipt"]) => {
    actions.setDiscount(ticket.id, disc);
    actions.pay(ticket.id, {
      tipCents: tip,
      tipMethod: cashTip ? "cash" : "card",
      payMethod: method === "cash" ? "cash" : method === "reader" ? "card" : "link",
      receipt,
    });
    actions.addLog(`#${ticket.number} ${L("đã trả", "paid")} ${fmt(total)} (${method})`);
    close();
  };

  const row = "flex justify-between py-2 border-b border-stone-100";
  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-semibold ${on ? "bg-stone-900 text-white" : "bg-stone-100"}`;
  const pay = (on: boolean, soon?: boolean) =>
    `rounded-xl border-2 p-4 text-left font-bold ${soon ? "border-stone-100 text-stone-300" : on ? "border-rose-600 bg-rose-50" : "border-stone-200 hover:border-stone-400"}`;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">
          {L("Tính tiền", "Checkout")} · #{ticket.number} · {c?.name} · {tech?.name}
        </h1>
        <button onClick={close} className="rounded-xl bg-stone-100 px-4 py-2 font-semibold">
          ← {L("Quay lại lịch", "Back to calendar")}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1.2fr] gap-6 max-w-5xl">
        {/* Ticket */}
        <section className="rounded-2xl bg-white border border-stone-200 p-5">
          {ticket.serviceIds.map((id) => (
            <div key={id} className={row}>
              <span>
                {serviceById(id)?.[s.lang]} · {tech?.name}
              </span>
              <span>{fmt(serviceById(id)?.priceCents ?? 0)}</span>
            </div>
          ))}
          <div className="py-3">
            <div className="text-sm font-semibold text-stone-500 mb-1">{L("Giảm giá (tiệm chịu)", "Discount (salon pays)")}</div>
            <div className="flex gap-1.5">
              <button className={chip(discount === "none")} onClick={() => setDiscount("none")}>{L("Không", "None")}</button>
              <button className={chip(discount === "5")} onClick={() => setDiscount("5")}>−$5</button>
              <button className={chip(discount === "10pct")} onClick={() => setDiscount("10pct")}>−10%</button>
            </div>
          </div>
          {disc > 0 && (
            <div className={row + " text-emerald-700"}>
              <span>{L("Giảm giá", "Discount")}</span>
              <span>−{fmt(disc)}</span>
            </div>
          )}
          <div className={row}>
            <span>{L("Tạm tính", "Subtotal")}</span>
            <span>{fmt(due)}</span>
          </div>
          <div className="py-3">
            <div className="text-sm font-semibold text-stone-500 mb-1">
              Tip {L("(khách chọn trên màn hình hoặc điện thoại)", "(client picks on screen or phone)")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[15, 20, 25].map((p) => (
                <button key={p} className={chip(!cashTip && tipPct === p)} onClick={() => { setCashTip(false); setTipPct(p); }}>
                  {p}% · {fmt(Math.round((due * p) / 100))}
                </button>
              ))}
              <button className={chip(!cashTip && tipPct === 0)} onClick={() => { setCashTip(false); setTipPct(0); }}>{L("Không tip", "No tip")}</button>
              <button className={chip(cashTip)} onClick={() => setCashTip(true)}>{L("Tip tiền mặt", "Cash tip")}</button>
            </div>
          </div>
          <div className={row}>
            <span>Tip → {tech?.name} (100%)</span>
            <span>{cashTip ? L("tiền mặt", "cash") : fmt(tip)}</span>
          </div>
          <div className={row + " text-stone-500 text-sm"}>
            <span>{L("Phí thẻ 2.7% + 5¢ (tiệm trả, không trừ tip)", "Card fee 2.7% + 5¢ (salon pays, not from tip)")}</span>
            <span>{method === "cash" ? "$0.00" : fmt(cardFee(total))}</span>
          </div>
          <div className="flex justify-between pt-3 text-3xl font-bold">
            <span>{L("Tổng", "Total")}</span>
            <span>{fmt(total)}</span>
          </div>
        </section>

        {/* Pay */}
        <section className="space-y-4">
          {!paid ? (
            <>
              <h2 className="font-bold text-lg">{L("Trả bằng", "Pay with")}</h2>
              <div className="grid grid-cols-3 gap-2">
                <button className={pay(method === "qr")} onClick={() => setMethod("qr")}>▦ {L("Hiện QR cho khách", "Show QR to client")}</button>
                <button className={pay(method === "link")} onClick={() => setMethod("link")}>📱 {L("Nhắn link trả tiền", "Text pay link")}</button>
                <button className={pay(method === "reader")} onClick={() => setMethod("reader")}>💳 {L("Máy quẹt thẻ", "Card reader")}</button>
                <button className={pay(method === "cash")} onClick={() => setMethod("cash")}>💵 {L("Tiền mặt", "Cash")}</button>
                <button className={pay(false, true)} disabled>🎁 {L("Thẻ quà tặng", "Gift card")} · {L("sắp có", "soon")}</button>
                <button className={pay(false, true)} disabled>➗ {L("Chia", "Split")} · {L("sắp có", "soon")}</button>
              </div>

              {method && method !== "cash" && (
                <div className="rounded-2xl bg-white border border-stone-200 p-5 flex gap-5 items-center">
                  {method === "qr" ? <FakeQR /> : <div className="text-6xl w-44 text-center">{method === "link" ? "📱" : "📶"}</div>}
                  <div className="space-y-3">
                    <p className="text-stone-600">
                      {method === "qr"
                        ? L("Khách quét bằng điện thoại, chọn tip bằng tiếng Anh và trả. Màn hình chuyển xanh khi trả xong.", "Client scans on their own phone, picks the tip in English, pays. Screen turns green when paid.")
                        : method === "link"
                          ? `${L("Đã nhắn link tới", "Pay link texted to")} ${c ? "•••" + c.phone.slice(-4) : ""}. ${L("Chờ khách trả…", "Waiting for the client…")}`
                          : `${L("Máy đọc thẻ đang chờ", "Reader waiting for")} ${fmt(total)}…`}
                    </p>
                    <button onClick={() => setPaid(true)} className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-bold">
                      {L("Giả lập: khách đã trả", "Simulate: client paid")}
                    </button>
                    {method === "qr" && (
                      <p className="text-xs text-stone-400">{L("Khách không quét được: nhắn link hoặc nhận tiền mặt.", "Client can't scan: text a pay link or take cash.")}</p>
                    )}
                  </div>
                </div>
              )}

              {method === "cash" && (
                <div className="rounded-2xl bg-white border border-stone-200 p-5 space-y-3">
                  <div className="flex gap-2">
                    {[total, 5000, 10000].map((v, i) => (
                      <button key={i} className={chip(given === v)} onClick={() => setGiven(v)}>
                        {i === 0 ? L("Đủ tiền", "Exact") : fmt(v)}
                      </button>
                    ))}
                  </div>
                  <div className="text-lg">
                    {L("Nhận", "Given")} <b>{fmt(given)}</b> · {L("Thối", "Change")} <b className="text-2xl">{fmt(Math.max(0, given - total))}</b>
                  </div>
                  <button disabled={given < total} onClick={() => setPaid(true)} className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-bold disabled:opacity-40">
                    {L("Đã nhận tiền", "Cash received")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-100 text-emerald-900 p-6 text-center">
                <div className="text-4xl">✓</div>
                <div className="text-2xl font-bold">
                  {L("Đã trả", "Paid")} {fmt(total)}
                </div>
                {fee > 0 && <div className="text-sm">{L("Phí thẻ", "Card fee")} {fmt(fee)}</div>}
              </div>
              <h2 className="font-bold text-lg">{L("Hóa đơn", "Receipt")}</h2>
              <div className="grid grid-cols-4 gap-2">
                <button className="rounded-xl bg-stone-100 py-3 font-bold" onClick={() => finish("print")}>{L("In", "Print")}</button>
                <button className="rounded-xl bg-stone-100 py-3 font-bold" onClick={() => finish("text")}>{L("Nhắn tin", "Text")}</button>
                <button className="rounded-xl bg-stone-100 py-3 font-bold" onClick={() => finish("email")}>Email</button>
                <button className="rounded-xl bg-rose-600 text-white py-3 font-bold" onClick={() => finish("none")}>{L("Xong · khách kế", "Done · next")}</button>
              </div>
              <p className="text-xs text-stone-400">{L("Máy in mất kết nối: nhắn tin hoặc email, in sau.", "Printer offline: text or email the receipt, print later.")}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
