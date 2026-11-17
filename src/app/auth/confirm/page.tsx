import type { Metadata } from "next";
import ConfirmEmail from "./ConfirmEmail";

export const metadata: Metadata = { title: "Confirm email · PolishOS", robots: { index: false } };

export default function Page() {
  return <ConfirmEmail />;
}
