import type { Metadata } from "next";
import ProfileEdit from "./ProfileEdit";

export const metadata: Metadata = { title: "My profile · PolishOS" };

export default function Page() { return <ProfileEdit />; }
