import type { Metadata } from "next";
import KitPage from "./KitPage";

export const metadata: Metadata = { title: "Design kit · Nail POS" };

export default function Page() {
  return <KitPage />;
}
