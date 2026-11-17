import type { Metadata } from "next";
import ClientsPage from "./ClientsPage";

export const metadata: Metadata = { title: "Clients · PolishOS" };

export default function Page() {
  return <ClientsPage />;
}
