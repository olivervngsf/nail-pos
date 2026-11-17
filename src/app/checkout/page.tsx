import type { Metadata } from "next";
import CheckoutHome from "./CheckoutHome";

export const metadata: Metadata = { title: "Checkout · Nail POS" };

export default function Page() {
  return <CheckoutHome />;
}
