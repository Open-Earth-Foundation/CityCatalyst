"use client";

import { Box } from "@chakra-ui/react";
import { RefObject, useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";

export function useAtBottom(rootRef?: RefObject<HTMLDivElement>, offset = 0) {
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (rootRef?.current) {
        setIsAtBottom(
          rootRef.current.scrollTop < rootRef.current.scrollHeight - offset,
        );
      }
    };

    const element = rootRef?.current;
    element?.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      element?.removeEventListener("scroll", handleScroll);
    };
  }, [offset, rootRef]);

  return isAtBottom;
}

export function ScrollAnchor({
  trackVisibility,
  rootRef,
}: {
  trackVisibility?: boolean;
  rootRef?: RefObject<HTMLDivElement>;
}) {
  // const isAtBottom = useAtBottom(rootRef);
  const { ref, inView } = useInView({
    trackVisibility,
    delay: 500,
    root: rootRef?.current,
    rootMargin: "0px 0px 0px 0px",
  });

  useEffect(() => {
    if (trackVisibility && rootRef?.current && !inView) {
      rootRef.current.scrollTop = rootRef.current.scrollHeight;
    }
  }, [inView, trackVisibility, rootRef]);

  return <Box ref={ref} h="1px" w="full" />;
}
