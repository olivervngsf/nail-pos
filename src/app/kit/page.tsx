import type { Metadata } from "next";
import KitPage from "./KitPage";

export const metadata: Metadata = { title: "Design kit · PolishOS" };

export default function Page() {
  return <KitPage />;
}
