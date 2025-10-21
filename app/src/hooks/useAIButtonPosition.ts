"use client";

import { useEffect, useState } from "react";

// Registry of known bottom bar selectors/identifiers
const BOTTOM_BAR_SELECTORS = ["[data-onboarding-bottom-bar]"];

export function useAIButtonPosition() {
  const [bottomPosition, setBottomPosition] = useState("8px");

  useEffect(() => {
    const calculatePosition = () => {
      if (typeof window === "undefined") return;

      let maxBottomHeight = 0;

      // Only check our known bottom bar selectors
      BOTTOM_BAR_SELECTORS.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const styles = window.getComputedStyle(el);

          // Ensure it's actually fixed and has height
          if (styles.position === "fixed" && rect.height > 0) {
            maxBottomHeight = Math.max(maxBottomHeight, rect.height);
          }
        });
      });

      const newPosition =
        maxBottomHeight > 0 ? `${maxBottomHeight + 16}px` : "8px";
      setBottomPosition(newPosition);
    };

    // Debounce for performance
    let timeoutId: NodeJS.Timeout;
    const debouncedCalculate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(calculatePosition, 100);
    };

    // Initial calculation with delay to ensure DOM is ready
    const initialTimeout = setTimeout(calculatePosition, 500);

    // Set up MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      debouncedCalculate();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-onboarding-bottom-bar"],
    });

    window.addEventListener("resize", debouncedCalculate);
    window.addEventListener("scroll", debouncedCalculate);

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(timeoutId);
      observer.disconnect();
      window.removeEventListener("resize", debouncedCalculate);
      window.removeEventListener("scroll", debouncedCalculate);
    };
  }, []);

  return bottomPosition;
}
