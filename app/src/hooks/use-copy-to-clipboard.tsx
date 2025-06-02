"use client";

import { useState } from "react";
import { logger } from "@/services/logger";

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
      logger.error({ err: error }, "Failed to copy text to clipboard");
    }
  };

  return { isCopied, copyToClipboard };
}
