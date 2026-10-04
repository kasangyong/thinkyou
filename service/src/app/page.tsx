import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";

export default async function Home() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === "youth") redirect("/youth");
  if (me.role === "mentor") redirect("/mentor");
  redirect("/care");
}
