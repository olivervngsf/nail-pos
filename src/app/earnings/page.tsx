import type { Metadata } from "next";
import Earnings from "./Earnings";

export const metadata: Metadata = { title: "My earnings · PolishOS" };

export default function Page() {
  return <Earnings />;
}
