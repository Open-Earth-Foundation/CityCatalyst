"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";

export function useAtBottom(offset = 0) {
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsAtBottom(
        window.innerHeight + window.scrollY >=
          document.body.offsetHeight - offset,
      );
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [offset]);

  return isAtBottom;
}

export function ScrollAnchor({
  trackVisibility,
}: {
  trackVisibility?: boolean;
}) {
  const isAtBottom = useAtBottom();
  const { ref, entry, inView } = useInView({
    trackVisibility,
    delay: 100,
    rootMargin: "0px 0px 0px 0px",
  });

  useEffect(() => {
    if (isAtBottom && trackVisibility && !inView) {
      entry?.target.scrollIntoView({
        block: "nearest",
        inline: "start",
        // behavior: "smooth",
      });
    }
  }, [inView, entry, isAtBottom, trackVisibility]);

  return <div ref={ref} className="h-px w-full" />;
}
