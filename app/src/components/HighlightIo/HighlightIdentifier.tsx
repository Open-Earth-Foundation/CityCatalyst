"use client";
import { useEffect } from "react";
import { H } from "@highlight-run/next/client";
import { useSession } from "next-auth/react";

// Only ever rendered by HighlightWidgets once it has already decided
// Highlight should be active — no enabled/route gating here.
export default function HighlightIdentifier() {
  const { data } = useSession();

  useEffect(() => {
    if (data?.user) {
      H.identify(data.user.email || "user", {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      });
    }
  }, [data]);
  return null;
}
