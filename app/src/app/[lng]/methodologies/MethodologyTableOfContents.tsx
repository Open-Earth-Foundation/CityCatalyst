"use client";
import LabelLarge from "@/components/Texts/Label";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { methodologiesBySector } from "./methodologies";
import { TitleMedium } from "@/components/Texts/Title";
import { Button, Icon } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { MdArrowBack } from "react-icons/md";
import { ButtonMedium } from "@/components/Texts/Button";

export function MethodologyTableOfContents({
  activeId,
}: {
  activeId?: string;
}) {
  const { t } = useTranslation("methodologies");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const router = useRouter();

  // Find the sector for the active methodology and expand it
  useEffect(() => {
    if (activeId) {
      const sector = methodologiesBySector.find((sector) =>
        sector.methodologies.some((m) => m.id === activeId),
      );
      if (sector) {
        setExpandedItems([sector.sector]);
      }
    }
  }, [activeId]);

  const handleValueChange = (details: { value: string[] }) => {
    setExpandedItems(details.value);
  };

  const handleClick = (id: string) => (e: React.MouseEvent) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleBack = () => {
    router.back();
  };

  const isExpanded = (sector: string) => {
    return expandedItems.includes(sector);
  };

  const isSelected = (id: string) => {
    return activeId === id;
  };

  const sectors = useMemo(
    () =>
      methodologiesBySector.map(
        ({ sector, sector_roman_numeral, methodologies }) => (
          <AccordionItem key={sector} value={sector} p="16px">
            <AccordionItemTrigger
              indicatorPlacement="end"
              hideIndicator={methodologies.length === 0}
            >
              <span
                style={{
                  color:
                    isSelected(sector) || isExpanded(sector)
                      ? "content.link"
                      : "content.secondary",
                  cursor: "pointer",
                }}
                onClick={handleClick(sector)}
              >
                <LabelLarge>
                  {[sector_roman_numeral, t(sector)]
                    .filter((x) => !!x)
                    .join(". ")}
                </LabelLarge>
              </span>
            </AccordionItemTrigger>
            {methodologies.length > 0 && (
              <AccordionItemContent>
                <ul>
                  {methodologies.map(({ id, translations }) => (
                    <LabelLarge
                      key={id}
                      p="16px"
                      border={isSelected(id) ? "1px solid" : "none"}
                      borderRadius="8px"
                      borderColor={"content.link"}
                      backgroundColor={
                        isSelected(id)
                          ? "background.neutral"
                          : "background.backgroundLight"
                      }
                    >
                      <a
                        href={`#${id}`}
                        onClick={handleClick(id)}
                        style={{
                          color: isSelected(id)
                            ? "content.link"
                            : "content.secondary",
                          cursor: "pointer",
                          textDecoration: "none",
                        }}
                      >
                        {translations.en.methodology}
                      </a>
                    </LabelLarge>
                  ))}
                </ul>
              </AccordionItemContent>
            )}
          </AccordionItem>
        ),
      ),
    [t, isSelected, handleClick, handleClick],
  );

  return (
    <nav style={{ position: "sticky", top: 30 }}>
      <div>
        <Button
          variant="ghost"
          color="content.link"
          onClick={handleBack}
          padding="0"
          height="auto"
          marginBottom="16px"
        >
          <Icon as={MdArrowBack} boxSize={4} />
          <ButtonMedium color="content.link" fontSize="16px">
            {t("go-back")}
          </ButtonMedium>
        </Button>
      </div>
      <TitleMedium>{t("methodologies-introduction.title")}</TitleMedium>
      <AccordionRoot value={expandedItems} onValueChange={handleValueChange}>
        <LabelLarge key={"introduction"} p="16px">
          <a
            href="#introduction"
            onClick={handleClick("introduction")}
            style={{
              color: isSelected("introduction")
                ? "content.link"
                : "content.secondary",
            }}
          >
            {t("methodologies-introduction.introduction")}
          </a>
        </LabelLarge>
        {sectors}
      </AccordionRoot>
    </nav>
  );
}
