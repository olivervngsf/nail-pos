"use client";
// Tech app · Me: who I am at which salon, language (English / Tiếng Việt, this phone), change my PIN (/t/pin), clients link, sign out.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ROLE_LABEL, signOut } from "@/lib/auth";
import { useLang } from "@/components/AppProviders";
import { Avatar, Button, ListGroup, Row, Segmented } from "@/components/kit";
import { TechShell, useTechMe } from "../tech";

export default function TechMePage() {
  const t = useTranslations("tech");
  const router = useRouter();
  const { lang, setLang } = useLang();
  const { me, err } = useTechMe();
  return (
    <TechShell title={t("tab_me")} me={me} err={err}>
      {me && <>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={me.name} />
          <div><b style={{ fontSize: 17 }}>{me.name}</b><span className="cap" style={{ display: "block" }}>{ROLE_LABEL[me.role]} · {me.salonName}</span></div>
        </div>
        <ListGroup>
          <Row title={t("language")} sub={t("languageSub")} right={<Segmented label={t("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }]} />} />
        </ListGroup>
        <Link className="btn primary" data-testid="my-profile" href="/t/me/profile">{t("myProfile")}</Link>
        <Link className="btn" data-testid="my-pin" href={`/t/pin?s=${me.salonId}`}>{t("myPin")}</Link>
        <Link className="btn" href="/clients">{t("clientsTile")}</Link>
        <Button variant="ghost" data-testid="sign-out" onClick={async () => { if (me.live) await signOut(); router.replace("/login"); }}>{t("signOut")}</Button>
      </>}
    </TechShell>
  );
}
