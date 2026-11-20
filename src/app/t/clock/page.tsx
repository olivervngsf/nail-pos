import { Suspense } from "react";
import ClockScan from "./ClockScan";
export default function Page() { return <Suspense fallback={<div aria-busy="true" />}><ClockScan /></Suspense>; }
