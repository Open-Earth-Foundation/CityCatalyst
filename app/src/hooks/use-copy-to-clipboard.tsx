"use client";

import { useState } from "react";

export function useCopyToClipboard({ timeout = 2000 }: { timeout?: number }) {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (
      !value ||
      typeof window === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      return;
    }

    try {
      navigator.clipboard.writeText(value).then(() => {
        setIsCopied(true);
        setTimeout(() => {
          setIsCopied(false);
        }, timeout);
      });
    } catch (error) {
      console.error("Failed to copy text to clipboard", error);
    }
  };

  return { isCopied, copyToClipboard };
}
