import type { Metadata } from "next";
import SetupWizard from "./SetupWizard";

export const metadata: Metadata = { title: "Salon setup · Nail POS" };

export default function SetupPage() {
  return <SetupWizard />;
}
