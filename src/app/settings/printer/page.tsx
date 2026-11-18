import type { Metadata } from "next";
import PrinterSettings from "./PrinterSettings";

export const metadata: Metadata = { title: "Printer · PolishOS" };

export default function Page() { return <PrinterSettings />; }
