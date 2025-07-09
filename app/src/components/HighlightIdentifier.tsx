"use client";

import { useEffect } from "react";
import { H } from "@highlight-run/next/client";
import { useSession } from "next-auth/react";

export default function HighlightIdentifier() {
  const { data: session } = useSession();

  useEffect(() => {
    H.identify(session?.user?.email!, {
      id: session?.user.id,
    });
  }, [session]);

  return null;
}
