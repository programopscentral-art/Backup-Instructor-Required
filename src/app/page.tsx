import { redirect } from "next/navigation";

// The middleware routes unauthenticated users to /login; everyone else lands
// on the role-aware dashboard.
export default function Home() {
  redirect("/dashboard");
}
