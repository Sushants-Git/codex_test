"use client";

import { useState, useCallback } from "react";
import { signIn, signOut } from "next-auth/react";

type Props =
  | {
      variant?: "signin";
      name?: never;
    }
  | {
      variant: "signout";
      name?: string | null;
    };

export default function SignInButton({ variant = "signin", name }: Props) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = useCallback(async () => {
    try {
      setLoading(true);
      const result = await signIn("google", { callbackUrl: "/", redirect: false });

      if (result?.url) {
        const popup = window.open(
          result.url,
          "googleSignIn",
          "popup=yes,width=480,height=720,noopener,noreferrer",
        );

        if (!popup) {
          window.location.href = result.url;
        }
      }
    } catch (error) {
      console.error("Failed to initiate Google sign-in", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      await signOut({ redirect: false });
      window.location.reload();
    } catch (error) {
      console.error("Failed to sign out", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClick = variant === "signout" ? handleSignOut : handleSignIn;
  const isSignOut = variant === "signout";
  const label =
    variant === "signout"
      ? loading
        ? "Signing out..."
        : `Sign out${name ? ` (${name})` : ""}`
      : loading
      ? "Opening Google..."
      : "Join Now";
  const buttonClassName = ["auth-btn", isSignOut ? "auth-btn--icon" : ""]
    .filter(Boolean)
    .join(" ");
  const buttonContent = isSignOut ? (
    <span className="auth-btn__icon" aria-hidden="true">
      {loading ? "…" : "🚪"}
    </span>
  ) : (
    label
  );

  return (
    <button
      className={buttonClassName}
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={isSignOut ? "Sign out" : undefined}
      title={isSignOut ? "Sign out" : undefined}
    >
      {buttonContent}
    </button>
  );
}
