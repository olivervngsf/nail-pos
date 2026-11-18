import type { Metadata } from "next";
import DevicesPage from "./DevicesPage";

export const metadata: Metadata = { title: "Devices · PolishOS" };

export default function Page() { return <DevicesPage />; }
