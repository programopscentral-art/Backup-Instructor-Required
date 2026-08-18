import { signOut } from "@/lib/auth/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="btn btn-ghost btn-sm">
        Sign out
      </button>
    </form>
  );
}
