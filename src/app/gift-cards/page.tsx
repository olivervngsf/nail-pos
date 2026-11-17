import type { Metadata } from "next";
import GiftCards from "./GiftCards";

export const metadata: Metadata = { title: "Gift cards · PolishOS" };

export default function Page() {
  return <GiftCards />;
}
