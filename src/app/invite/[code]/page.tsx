import type { Metadata } from "next";
import InvitePage from "../InvitePage";

export const metadata: Metadata = { title: "You're invited · PolishOS" };
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InvitePage code={code} />;
}
