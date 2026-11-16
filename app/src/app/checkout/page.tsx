"use client";

import { useState } from "react";
import { Header, Keypad, primary, secondary } from "@/components/Shell";
import { serviceById, staffById, type Ticket } from "@/lib/data";
import { cardFee, fmt } from "@/lib/money";
import { clientByPhone, useStore } from "@/lib/store";

// Client-facing steps are always in English. Front desk list follows the toggle.
type Step = "ticket" | "tip" | "customTip" | "pay" | "cash" | "card" | "receipt" | "thanks";

export default function CheckoutPage() {
  const { s, t } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const ready = s.tickets.filter((x) => x.status === "ready");
  const open = s.tickets.find((x) => x.id === openId);

  if (open) return <Checkout ticket={open} close={() => setOpenId(null)} />;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl p-4">
        <h1 className="text-lg font-bold mb-3">{t("readyToPay")}</h1>
        {ready.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-stone-500">{t("noReady")}</p>
        ) : (
          <ul className="space-y-3">
            {ready.map((x) => (
              <li key={x.id}>
                <button onClick={() => setOpenId(x.id)} className="w-full text-left rounded-2xl bg-white border border-stone-200 p-4 shadow-sm flex justify-between items-center">
                  <span>
                    <span className="text-xl font-bold">#{x.number} · {clientByPhone(s, x.phone)?.name}</span>
                    <span className="block text-stone-500">
                      {staffById(x.techId)?.name} · {x.serviceIds.map((id) => serviceById(id)?.[s.lang]).join(" + ")}
                    </span>
                  </span>
                  <span className="text-xl font-bold">{fmt(x.subtotalCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function Checkout({ ticket, close }: { ticket: Ticket; close: () => void }) {
  const { s, actions } = useStore();
  const [step, setStep] = useState<Step>("ticket");
  const [tip, setTip] = useState(0);
  const [tipMethod, setTipMethod] = useState<"card" | "cash">("card");
  const [custom, setCustom] = useState("");
  const [payMethod, setPayMethod] = useState<"card" | "cash" | "link">("card");
  const [given, setGiven] = useState("");
  const [declined, setDeclined] = useState(false);
  const client = clientByPhone(s, ticket.phone);
  const tech = staffById(ticket.techId);
  const sub = ticket.subtotalCents;
  const cardTip = tipMethod === "card" ? tip : 0;
  const total = sub + cardTip;
  const fee = payMethod === "cash" ? (cardTip ? cardFee(cardTip) : 0) : cardFee(total);

  const pickTip = (cents: number, method: "card" | "cash" = "card") => {
    setTip(cents);
    setTipMethod(method);
    setStep("pay");
  };

  const pay = (receipt: Ticket["receipt"]) => {
    actions.pay(ticket.id, { tipCents: tip, tipMethod, payMethod, receipt });
    setStep("thanks");
  };

  const Lines = () => (
    <div className="rounded-2xl bg-white border border-stone-200 p-5 space-y-2">
      {ticket.serviceIds.map((id) => (
        <div key={id} className="flex justify-between text-lg">
          <span>{serviceById(id)?.en}</span>
          <span>{fmt(serviceById(id)?.priceCents ?? 0)}</span>
        </div>
      ))}
      <div className="flex justify-between text-stone-500 border-t pt-2">
        <span>Subtotal</span>
        <span>{fmt(sub)}</span>
      </div>
      {step !== "ticket" && step !== "tip" && step !== "customTip" && (
        <div className="flex justify-between text-stone-500">
          <span>Tip for {tech?.name} {tipMethod === "cash" && tip ? "(cash)" : ""}</span>
          <span>{fmt(tip)}</span>
        </div>
      )}
      {step !== "ticket" && step !== "tip" && step !== "customTip" && (
        <div className="flex justify-between text-2xl font-bold border-t pt-2">
          <span>Total {tipMethod === "cash" && tip ? "(card/cash now)" : ""}</span>
          <span>{fmt(total)}</span>
        </div>
      )}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-md p-4 space-y-4">
        <div className="flex justify-between items-center text-sm text-stone-500">
          <span>Ticket #{ticket.number} · {client?.name}</span>
          {step !== "thanks" && <button className="font-semibold" onClick={close}>✕ Close</button>}
        </div>
        {children}
      </div>
    </main>
  );

  if (step === "ticket")
    return shell(
      <>
        <h1 className="text-2xl font-bold">Hi {client?.name?.split(" ")[0]}! Here&apos;s your ticket</h1>
        <p className="text-stone-500">Your tech today: {tech?.name}</p>
        <Lines />
        <button className={primary} onClick={() => setStep("tip")}>Continue</button>
      </>,
    );

  if (step === "tip")
    return shell(
      <>
        <h1 className="text-2xl font-bold">Add a tip for {tech?.name}?</h1>
        <p className="text-stone-500">100% of your tip goes to {tech?.name}.</p>
        <div className="grid grid-cols-3 gap-3">
          {[15, 20, 25].map((p) => (
            <button key={p} onClick={() => pickTip(Math.round((sub * p) / 100))} className="rounded-2xl bg-white border-2 border-stone-200 py-6 active:border-rose-600">
              <div className="text-2xl font-bold">{p}%</div>
              <div className="text-stone-500">{fmt(Math.round((sub * p) / 100))}</div>
            </button>
          ))}
        </div>
        <button className={secondary} onClick={() => setStep("customTip")}>Custom amount</button>
        <button className={secondary} onClick={() => pickTip(0, "cash")}>I&apos;ll tip in cash</button>
        <button className="w-full py-3 text-stone-500" onClick={() => pickTip(0)}>No tip</button>
      </>,
    );

  if (step === "customTip")
    return shell(
      <>
        <h1 className="text-2xl font-bold">Tip amount</h1>
        <div className="text-5xl font-bold text-center">{fmt(Number(custom || 0))}</div>
        <Keypad onKey={(d) => setCustom((c) => (c.length < 5 ? c + d : c))} onDelete={() => setCustom((c) => c.slice(0, -1))} />
        <button className={primary} onClick={() => pickTip(Number(custom || 0))}>Add tip</button>
        <button className={secondary} onClick={() => setStep("tip")}>Back</button>
      </>,
    );

  if (step === "pay")
    return shell(
      <>
        <Lines />
        {declined && <div className="rounded-2xl bg-red-50 text-red-800 p-4 font-semibold">Card declined. Try again or pay cash.</div>}
        <h2 className="text-xl font-bold">How would you like to pay?</h2>
        <button className={primary} onClick={() => { setDeclined(false); setPayMethod("card"); setStep("card"); }}>💳 Card or phone (reader)</button>
        <button className={secondary} onClick={() => { setPayMethod("cash"); setStep("cash"); }}>💵 Cash</button>
        <button className={secondary} onClick={() => { setPayMethod("link"); setStep("card"); }}>📱 QR code / pay link</button>
        <p className="text-xs text-stone-500 text-center">
          Card fee shown to salon: 2.7% + 5¢ ≈ {fmt(cardFee(total))}. Nothing is taken from the tip.
        </p>
      </>,
    );

  if (step === "card")
    return shell(
      <>
        <Lines />
        <div className="rounded-2xl bg-white border-2 border-dashed border-stone-300 p-8 text-center space-y-3">
          <div className="text-6xl">{payMethod === "link" ? "▦" : "📶"}</div>
          <div className="text-xl font-bold">{payMethod === "link" ? "Scan to pay" : "Tap, insert or swipe on the reader"}</div>
          <div className="text-stone-500">{fmt(total)}</div>
        </div>
        <button className={primary} onClick={() => setStep("receipt")}>Simulate: payment approved</button>
        <button className={`${secondary} text-red-700`} onClick={() => { setDeclined(true); setStep("pay"); }}>Simulate: card declined</button>
        <button className={secondary} onClick={() => setStep("pay")}>Back</button>
      </>,
    );

  if (step === "cash") {
    const g = Number(given || 0);
    return shell(
      <>
        <Lines />
        <h2 className="text-xl font-bold">Cash given</h2>
        <div className="grid grid-cols-4 gap-2">
          {[total, 2000, 5000, 10000].map((v, i) => (
            <button key={i} onClick={() => setGiven(String(v))} className="rounded-xl bg-white border-2 border-stone-200 py-3 font-bold">
              {i === 0 ? "Exact" : fmt(v)}
            </button>
          ))}
        </div>
        <div className="text-center text-lg">
          Given <b>{fmt(g)}</b> · Change <b className="text-2xl">{fmt(Math.max(0, g - total))}</b>
        </div>
        <button className={primary} disabled={g < total} onClick={() => setStep("receipt")}>Paid</button>
        <button className={secondary} onClick={() => setStep("pay")}>Back</button>
      </>,
    );
  }

  if (step === "receipt")
    return shell(
      <>
        <div className="rounded-2xl bg-emerald-50 text-emerald-800 p-4 text-center text-xl font-bold">✓ Paid {fmt(total)}</div>
        <h2 className="text-xl font-bold">Would you like a receipt?</h2>
        <button className={primary} onClick={() => pay("text")}>Text to {client ? `•••${client.phone.slice(-4)}` : "my phone"}</button>
        <button className={secondary} onClick={() => pay("email")}>Email</button>
        <button className={secondary} onClick={() => pay("print")}>Print</button>
        <button className="w-full py-3 text-stone-500" onClick={() => pay("none")}>No receipt</button>
        {fee > 0 && <p className="text-xs text-stone-400 text-center">Salon card fee on this ticket: {fmt(fee)}</p>}
      </>,
    );

  return shell(
    <div className="text-center space-y-6 pt-16">
      <div className="mx-auto w-24 h-24 rounded-full bg-emerald-100 text-emerald-700 text-6xl flex items-center justify-center">✓</div>
      <h1 className="text-3xl font-bold">Thank you, {client?.name?.split(" ")[0]}!</h1>
      <p className="text-stone-500">See you next time 💅</p>
      <button className={primary} onClick={close}>Next ticket</button>
    </div>,
  );

}
