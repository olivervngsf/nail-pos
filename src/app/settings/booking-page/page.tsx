import type { Metadata } from "next";
import BookingPageSettings from "./BookingPageSettings";

export const metadata: Metadata = { title: "Booking page · PolishOS" };

export default function Page() { return <BookingPageSettings />; }
