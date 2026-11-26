import { SettingsGroupPage } from "../../SettingsShell";

// Settings → one "Running the salon" row (phones + tablets): the short list of its pages.
export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  return <SettingsGroupPage group={group} />;
}
