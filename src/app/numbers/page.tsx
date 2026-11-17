import type { Metadata } from "next";
import NumbersPage from "./NumbersPage";

export const metadata: Metadata = { title: "Numbers · PolishOS" };

export default function Page() { return <NumbersPage />; }
