"use client";
import { useEffect } from "react";
import { H } from "@highlight-run/next/client";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { isUnauthenticatedHighlightRoute } from "./route-gate";

interface HighlightIdentifierProps {
  enabled: boolean;
}

export default function HighlightIdentifier({ enabled }: HighlightIdentifierProps) {
  const { data } = useSession();
  const pathname = usePathname();
  const isActive = enabled && !isUnauthenticatedHighlightRoute(pathname);

  useEffect(() => {
    if (isActive && data?.user) {
      H.identify(data.user.email || "user", {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      });
    }
  }, [isActive, data]);
  return null;
}
