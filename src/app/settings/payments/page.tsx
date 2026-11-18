import type { Metadata } from "next";
import PaymentsPage from "./PaymentsPage";

export const metadata: Metadata = { title: "Payments · PolishOS" };

export default function Page() { return <PaymentsPage />; }
