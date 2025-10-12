import { unstable_noStore } from "next/cache";

export default function JoinPage() {
  unstable_noStore();
  return (
    <main className="page">
      <h1>Join the Fit Month Challenge</h1>
      <p>
        Authentication and Google Fit syncing are under construction. The join experience will walk
        you through Google sign-in and securely capture the refresh token needed to read your
        activity data.
      </p>
    </main>
  );
}
