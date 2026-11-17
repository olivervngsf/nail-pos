import type { Metadata } from "next";
import StaffJoin from "./StaffJoin";

export const metadata: Metadata = { title: "Join your salon · PolishOS" };

// Invite details ride in the link for now (test version). Later: look up the invite by code in Supabase.
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { code } = await params;
  const q = await searchParams;
  const invite = {
    code,
    name: (q.n || "Linh Tran").slice(0, 60),
    role: (q.r || "Tech").slice(0, 20),
    salon: (q.s || "Mai Nails").slice(0, 60),
    owner: (q.o || "Mai").slice(0, 30),
  };
  return <StaffJoin invite={invite} />;
}
