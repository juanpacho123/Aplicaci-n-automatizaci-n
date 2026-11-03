import { redirect } from "next/navigation";
import { getPageAuth } from "@/lib/authz/guards";
import { homePathFor } from "@/lib/authz/policy";

export default async function Root() {
  const ctx = await getPageAuth();
  redirect(ctx ? homePathFor(ctx.role) : "/login");
}
