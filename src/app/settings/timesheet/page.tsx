import type { Metadata } from "next";
import TimesheetPage from "./TimesheetPage";

export const metadata: Metadata = { title: "Timesheet · PolishOS" };

export default function Page() { return <TimesheetPage />; }
