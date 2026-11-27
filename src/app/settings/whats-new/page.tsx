import type { Metadata } from "next";
import WhatsNew from "./WhatsNew";

export const metadata: Metadata = { title: "What's new · PolishOS" };

export default function Page() { return <WhatsNew />; }
