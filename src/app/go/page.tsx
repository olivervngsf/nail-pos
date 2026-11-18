import { Suspense } from "react";
import GoPage from "./GoPage";

export const metadata = { title: "Set up this device · PolishOS" };
export default function Page() {
  return <Suspense fallback={<div className="app" aria-busy="true" />}><GoPage /></Suspense>;
}
