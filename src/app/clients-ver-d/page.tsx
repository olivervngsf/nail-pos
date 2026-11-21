import type { Metadata } from "next";
import ClientsPage from "../clients/ClientsPage";

// Test route for user testing (version D = what /clients shows today). Goes away once the winner is picked.
export const metadata: Metadata = { title: "Clients (D) · PolishOS" };

export default function Page() {
  return <ClientsPage />;
}
