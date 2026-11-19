import { redirect } from "next/navigation";

/** Old Messages and Referrals links land on the merged Messages page (/inbox). */
export default function Messages() {
  redirect("/inbox");
}
