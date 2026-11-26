import type { Metadata } from "next";
import { Suspense } from "react";
import ActivityLogPage from "./ActivityLog";

export const metadata: Metadata = { title: "Activity log · PolishOS" };

export default function Page() { return <Suspense><ActivityLogPage /></Suspense>; }
