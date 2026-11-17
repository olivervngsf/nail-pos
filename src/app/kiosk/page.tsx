import type { Metadata } from "next";
import Kiosk from "./Kiosk";

export const metadata: Metadata = { title: "Check in · PolishOS", robots: { index: false } };

export default function Page() { return <Kiosk />; }
