import type { Metadata } from "next";
import LoyaltySettings from "./LoyaltySettings";

export const metadata: Metadata = { title: "Loyalty · PolishOS" };

export default function Page() { return <LoyaltySettings />; }
