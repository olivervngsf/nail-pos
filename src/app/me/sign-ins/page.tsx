import type { Metadata } from "next";
import SignInsPage from "./SignInsPage";

export const metadata: Metadata = { title: "My sign-ins · PolishOS" };

export default function Page() { return <SignInsPage />; }
