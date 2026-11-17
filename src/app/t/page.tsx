import type { Metadata } from "next";
import TechHome from "./TechHome";

export const metadata: Metadata = { title: "My day · PolishOS" };

export default function Page() {
  return <TechHome />;
}
