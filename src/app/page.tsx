import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card pad in" style={{ width: "100%", maxWidth: 440, padding: 28, gap: 16 }}>
        <div className="logo">NP</div>
        <h1 className="h1">Nail POS</h1>
        <p className="cap lead" style={{ margin: 0 }}>Simple checkout and fair, clear pay for techs. · Tính tiền đơn giản, lương thợ rõ ràng.</p>
        <Link className="btn primary block" href="/setup">Set up my salon</Link>
        <Link className="btn block" href="/join/DEMO">I&apos;m staff: join my salon</Link>
        <div className="demo">Test version · nothing is charged or texted yet.</div>
      </div>
    </main>
  );
}
