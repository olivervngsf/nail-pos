import type { Metadata } from "next";
import TodayDesk from "./TodayDesk";

export const metadata: Metadata = { title: "Today · PolishOS" };

export default function Page() {
  return <TodayDesk />;
}
