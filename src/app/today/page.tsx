import type { Metadata } from "next";
import TodayDesk from "./TodayDesk";

export const metadata: Metadata = { title: "Today · Nail POS" };

export default function Page() {
  return <TodayDesk />;
}
