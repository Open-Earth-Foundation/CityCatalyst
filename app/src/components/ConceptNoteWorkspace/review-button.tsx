"use client";

import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Review controls sit on white surfaces; the global ghost recipe is for dark navigation. */
export const ReviewButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function ReviewButton({ variant = "solid", color, ...props }, ref) {
    const isSolid = variant === "solid";
    const foreground =
      color ??
      (isSolid
        ? "base.light"
        : variant === "ghost"
          ? "content.secondary"
          : "content.link");
    return (
      <Button
        ref={ref}
        variant={variant}
        borderRadius="6px"
        borderWidth={variant === "outline" ? "1px" : undefined}
        borderColor={variant === "outline" ? "border.neutral" : undefined}
        textTransform="none"
        letterSpacing="normal"
        fontFamily="body"
        fontWeight="medium"
        fontSize="14px"
        color={foreground}
        _hover={{
          color: foreground,
          bg: isSolid ? "interactive.secondary" : "background.neutral",
          opacity: 1,
        }}
        _focusVisible={{
          color: foreground,
          outline: "2px solid",
          outlineColor: "content.link",
          outlineOffset: "2px",
        }}
        _disabled={{
          color: "content.disabled",
          opacity: 0.6,
          cursor: "not-allowed",
          _hover: { color: "content.disabled", opacity: 0.6 },
        }}
        {...props}
      />
    );
  },
);
