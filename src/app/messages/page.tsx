import { redirect } from "next/navigation";

/** Messages moved into Referrals (Send today, Follow up, Waiting). Old links and emails land there. */
export default function Messages() {
  redirect("/network");
}
