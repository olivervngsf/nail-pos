import { redirect } from "next/navigation";

// Old / printed links: /book/<salon> → /<salon> (keeps ?src=…).
export default async function Page({ params, searchParams }: { params: Promise<{ salon: string }>; searchParams: Promise<Record<string, string>> }) {
  const { salon } = await params;
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/${salon}${q ? `?${q}` : ""}`);
}
