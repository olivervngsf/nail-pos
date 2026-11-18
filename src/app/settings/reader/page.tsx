import type { Metadata } from "next";
import ReaderPage from "./ReaderPage";

export const metadata: Metadata = { title: "Card reader · PolishOS" };

export default function Page() { return <ReaderPage />; }
