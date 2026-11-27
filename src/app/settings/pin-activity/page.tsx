import { redirect } from "next/navigation";

// PIN activity is now the PIN filter of the Activity log (Nov 26). Old links still work.
export default function Page() { redirect("/settings/activity?kind=pin"); }
