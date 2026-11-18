// Public legal pages in plain words: /legal/terms, /legal/privacy, /legal/texts.
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL, LEGAL_UPDATED } from "@/lib/legal";

const NAV = [["terms", "Terms"], ["privacy", "Privacy"], ["texts", "Text messages"]] as const;
export function generateStaticParams() { return NAV.map(([doc]) => ({ doc })); }
export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const d = LEGAL[(await params).doc as keyof typeof LEGAL];
  return { title: d ? `${d.title} · PolishOS` : "PolishOS" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL[doc as keyof typeof LEGAL];
  if (!d) notFound();
  return (
    <main className="legal">
      <nav className="legal-nav" aria-label="Legal pages">
        <Link href="/" className="logo" style={{ margin: 0 }} aria-label="PolishOS">P</Link>
        <span className="seg">{NAV.map(([k, label]) => <Link key={k} href={`/legal/${k}`} aria-current={k === doc ? "page" : undefined}><span className={k === doc ? "on" : ""}>{label}</span></Link>)}</span>
      </nav>
      <h1 className="h1" data-testid="legal-title">{d.title}</h1>
      <p className="cap">Last updated {LEGAL_UPDATED}</p>
      <p>{d.intro}</p>
      {d.parts.map((s) => (
        <section key={s.h}>
          <h2 className="h2">{s.h}</h2>
          {s.p.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
    </main>
  );
}
