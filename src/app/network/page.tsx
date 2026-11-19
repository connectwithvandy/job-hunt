import { redirect } from "next/navigation";

/** Referrals moved into Messages (19 Nov), so every ask, follow-up and reply is in one place. Old links land there. */
export default function Network() {
  redirect("/inbox");
}
