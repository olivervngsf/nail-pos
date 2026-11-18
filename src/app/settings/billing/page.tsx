import type { Metadata } from "next";
import BillingPage from "./BillingPage";

export const metadata: Metadata = { title: "Billing · PolishOS" };

export default function Page() { return <BillingPage />; }
