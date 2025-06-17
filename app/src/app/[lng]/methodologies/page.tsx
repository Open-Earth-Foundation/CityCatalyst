"use client";

import React, { useMemo } from "react";
import useScrollSpy from "@/hooks/useScrollSpy";
import { methodologiesBySector } from "./methodologies";
import i18next from "i18next";
import { LANGUAGES } from "@/util/types";
import { useTranslation } from "react-i18next";
import { MethodologyContent } from "./MethodologyContent";
import { MethodologyTableOfContents } from "./MethodologyTableOfContents";
import Footer from "@/components/Sections/Footer";

export default function MethodologiesPage() {
  const lng = i18next.language as LANGUAGES;
  const { t } = useTranslation("methodologies");

  const ids = useMemo(() => {
    const result: string[] = [];
    methodologiesBySector.forEach(({ sector, methodologies }) => {
      result.push(sector);
      methodologies.forEach(({ id }) => result.push(id));
    });
    return result;
  }, []);
  const activeId = useScrollSpy(ids, {
    rootMargin: "0px 0px 0px 0px",
    threshold: 0,
  });

  return (
    <>
      <div
        style={{
          display: "flex",
          padding: "96px 96px",
          minHeight: "100vh",
          width: "100%",
        }}
      >
        <aside
          style={{
            width: 240,
            position: "sticky",
            top: 86,
            height: "fit-content",
          }}
        >
          <MethodologyTableOfContents activeId={activeId} />
        </aside>
        <main style={{ flex: 1, marginLeft: "48px" }}>
          <MethodologyContent />
        </main>
      </div>
      <Footer lng={lng} />
    </>
  );
}
