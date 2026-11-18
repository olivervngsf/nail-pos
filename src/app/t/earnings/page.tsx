import type { Metadata } from "next";
import TechEarnings from "./TechEarnings";

export const metadata: Metadata = { title: "My earnings · PolishOS" };

export default function Page() { return <TechEarnings />; }
