import type { Metadata } from "next";
import AdminHome from "./AdminHome";

export const metadata: Metadata = { title: "Admin · PolishOS" };

export default function Page() {
  return <AdminHome />;
}
