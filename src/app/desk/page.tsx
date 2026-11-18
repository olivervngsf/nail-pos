import type { Metadata } from "next";
import TodayDesk from "../today/TodayDesk";

export const metadata: Metadata = { title: "Front desk · PolishOS" };

export default function Page() {
  return <TodayDesk />;
}
