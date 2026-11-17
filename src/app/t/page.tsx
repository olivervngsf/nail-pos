import type { Metadata } from "next";
import TechHome from "./TechHome";

export const metadata: Metadata = { title: "My day · Nail POS" };

export default function Page() {
  return <TechHome />;
}
