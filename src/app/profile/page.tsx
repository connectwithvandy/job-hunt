import { redirect } from "next/navigation";

/** Profile's first page lives at /account; this keeps a typed or shared /profile link working. */
export default function Profile() {
  redirect("/account");
}
