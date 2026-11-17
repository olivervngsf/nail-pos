import type { Metadata } from "next";
import Payouts from "./Payouts";

export const metadata: Metadata = { title: "Payout sheet · PolishOS" };

export default function Page() {
  return <Payouts />;
}
