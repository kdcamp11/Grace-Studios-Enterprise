import { redirect } from "next/navigation";

// Root redirects to the login/landing page
export default function Home() {
  redirect("/login");
}
