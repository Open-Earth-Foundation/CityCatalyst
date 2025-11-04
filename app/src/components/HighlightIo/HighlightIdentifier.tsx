"use client";
import { useEffect } from "react";
import { H } from "@highlight-run/next/client";
import { useSession } from "next-auth/react";

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
