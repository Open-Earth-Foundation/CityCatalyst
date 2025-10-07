"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirectToLogin({ lng }: { lng: string }) {
  const router = useRouter();

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const callbackUrl = `${pathname}${search}${hash}`;
    const loginParams = new URLSearchParams({ callbackUrl });
    router.replace(`/${lng}/auth/login?${loginParams.toString()}`);
  }, [lng, router]);

  return null;
}