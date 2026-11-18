import type { Metadata } from "next";
import AdminPage from "./AdminPage";

export const metadata: Metadata = { title: "Salons · PolishOS admin" };
export default function Page() {
  return <AdminPage />;
}
