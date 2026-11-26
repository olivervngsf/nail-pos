import type { Metadata } from "next";
import RemindersPage from "./RemindersPage";

export const metadata: Metadata = { title: "Booking reminders · PolishOS" };

export default function Page() { return <RemindersPage />; }
