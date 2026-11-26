import type { Metadata } from "next";
import ContactPage from "./ContactPage";

export const metadata: Metadata = { title: "Call + text clients · PolishOS" };

export default function Page() { return <ContactPage />; }
