import type { Metadata } from "next";
import RolesPage from "./RolesPage";

export const metadata: Metadata = { title: "Roles + permissions · PolishOS" };

export default function Page() { return <RolesPage />; }
