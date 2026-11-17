import type { Metadata } from "next";
import StaffBook from "./StaffBook";

export const metadata: Metadata = { title: "Book a client · PolishOS" };

export default function Page() { return <StaffBook />; }
