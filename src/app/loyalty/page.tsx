import { redirect } from "next/navigation";

// Loyalty rules moved into the Settings window (Nov 27). Old links + bookmarks land there.
export default function Page() { redirect("/settings/loyalty"); }
