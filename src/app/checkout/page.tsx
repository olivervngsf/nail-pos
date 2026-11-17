import type { Metadata } from "next";
import CheckoutHome from "./CheckoutHome";

export const metadata: Metadata = { title: "Checkout · PolishOS" };

export default function Page() {
  return <CheckoutHome />;
}
