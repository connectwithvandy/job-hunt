import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL, missing } from "@/lib/legal";

export const metadata: Metadata = { title: "Contact", description: "Write to hello@jobpipe.in about access, billing, bugs or deleting your data.", alternates: { canonical: "/contact" } };

export default function Contact() {
  return (
    <LegalPage title="Contact">
      <p>{LEGAL.product} is run by {missing(LEGAL.owner)}.</p>
      <p>
        Email: {missing(LEGAL.email)}
        <br />
        Phone: {missing(LEGAL.phone)}
        <br />
        Address: {LEGAL.address}
      </p>
      <p>We reply within two working days.</p>
    </LegalPage>
  );
}
