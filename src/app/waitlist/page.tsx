import { redirect } from "next/navigation";

/** The old address for the owner's page; it's the admin centre now. */
export default function Waitlist() {
  redirect("/admin");
}
