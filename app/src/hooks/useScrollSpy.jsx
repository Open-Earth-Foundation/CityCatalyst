import { useState, useEffect } from "react";

function useScrollSpy(
  sectionIds,
  options = { rootMargin: "0px 0px -80% 0px", threshold: 0 },
) {
  const [activeId, setActiveId] = useState();

  useEffect(() => {
    if (!sectionIds || sectionIds.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      // pick the one most in‐view
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length > 0) {
        const best = visible.reduce((a, b) =>
          a.intersectionRatio > b.intersectionRatio ? a : b,
        );
        setActiveId(best.target.id);
      }
    }, options);

    sectionIds.forEach((id) => {
      const elem = document.getElementById(id);
      if (elem) observer.observe(elem);
    });

    return () => observer.disconnect();
  }, [sectionIds, options]);

  return activeId;
}

export default useScrollSpy;
