import type { Metadata } from "next";
import ClientsTable from "./ClientsTable";

// Test route for user testing (version C). After testing, the winner becomes /clients and this route goes away.
export const metadata: Metadata = { title: "Clients (C) · PolishOS" };

export default function Page() {
  return <ClientsTable />;
}
