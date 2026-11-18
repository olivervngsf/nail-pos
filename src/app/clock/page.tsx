import type { Metadata } from "next";
import ClockPage from "./ClockPage";

export const metadata: Metadata = { title: "Time clock · PolishOS" };

export default function Page() { return <ClockPage />; }
