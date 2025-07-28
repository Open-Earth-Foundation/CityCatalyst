"use client";

import React from "react";
import { methodologiesBySector } from "./methodologies";
import { useParams } from "next/navigation";
import { LANGUAGES } from "@/util/types";
import { useTranslation } from "react-i18next";
import { HeadlineLarge } from "@/components/Texts/Headline";
import { TitleLarge } from "@/components/Texts/Title";
import { BodyLarge, BodyMedium } from "@/components/Texts/Body";
import { TitleMedium } from "@/components/Texts/Title";
import { List, ListItem, VStack, HStack, Image } from "@chakra-ui/react";

import { ButtonSmall } from "@/components/Texts/Button";
import { Equation as IEquation } from "./types";
import { LatexEquation } from "@/components/LatexEquation";
import { DisplayMedium } from "@/components/Texts/Display";

const Equation = ({ equation }: { equation: IEquation }) => (
  <>
    <BodyLarge>{equation?.label}</BodyLarge>
    <VStack alignItems={"center"}>
      <LatexEquation formula={`$${equation.formula}$`} />
    </VStack>
  </>
);

export function MethodologyContent() {
  const { lng } = (useParams() || { lng: "en" }) as { lng: LANGUAGES };
  const { t } = useTranslation("methodologies");
  return (
    <div style={{ padding: "12px 96px" }}>
      <section id="introduction" style={{ scrollMarginTop: "100px" }}>
        <DisplayMedium py="12px" color="content.secondary">
          {t("methodologies-introduction.title")}
        </DisplayMedium>
        <HeadlineLarge py="12px" textAlign={"left"}>
          {t("methodologies-introduction.introduction")}
        </HeadlineLarge>
        <TitleLarge py="12px">
          {t("methodologies-introduction.about")}
        </TitleLarge>
        <BodyLarge py="12px">{t("methodologies-introduction.p1")}</BodyLarge>
        <BodyLarge py="12px">{t("methodologies-introduction.p2")}</BodyLarge>
        <BodyLarge py="12px">{t("methodologies-introduction.p3")}</BodyLarge>
        <List.Root>
          {["complete", "consistent", "comparable", "transparent"].map(
            (item) => (
              <ListItem key={item}>
                <BodyLarge>{t(`methodologies-introduction.${item}`)}</BodyLarge>
              </ListItem>
            ),
          )}
        </List.Root>
      </section>
      {methodologiesBySector.map(
        ({ sector, sector_roman_numeral, methodologies }) => {
          return (
            <div
              key={sector}
              id={sector}
              style={{ padding: "96px 0", scrollMarginTop: "100px" }}
            >
              <HeadlineLarge textAlign={"left"}>
                {[sector_roman_numeral, t(sector)]
                  .filter((x) => !!x)
                  .join(". ")}
              </HeadlineLarge>
              {methodologies.map(({ id, translations }) => (
                <section
                  id={id}
                  key={id}
                  style={{
                    paddingBottom: "96px",
                    scrollMarginTop: "100px",
                  }}
                >
                  <TitleLarge style={{ padding: "24px 0" }}>
                    {translations[lng].methodology}
                  </TitleLarge>
                  <BodyLarge>{translations[lng].overview}</BodyLarge>
                  {translations[lng].assumptions && (
                    <HStack>
                      <TitleMedium style={{ padding: "24px 0" }}>
                        {t("key-assumptions")}
                      </TitleMedium>
                    </HStack>
                  )}
                  <List.Root>
                    {translations[lng].assumptions?.map((assumption, i) => (
                      <HStack key={i}>
                        <ListItem>
                          <BodyLarge>{assumption}</BodyLarge>
                        </ListItem>
                      </HStack>
                    ))}
                  </List.Root>
                  {translations[lng].advantages && (
                    <HStack>
                      <TitleMedium style={{ padding: "24px 0" }}>
                        {t("advantages")}
                      </TitleMedium>
                    </HStack>
                  )}
                  <List.Root>
                    {translations[lng].advantages?.map((advantage, i) => (
                      <HStack key={i}>
                        <ListItem>
                          <BodyLarge>{advantage}</BodyLarge>
                        </ListItem>
                      </HStack>
                    ))}
                  </List.Root>
                  {translations[lng].limitations && (
                    <HStack>
                      <TitleMedium style={{ padding: "24px 0" }}>
                        {t("limitations")}
                      </TitleMedium>
                    </HStack>
                  )}
                  <List.Root>
                    {translations[lng].limitations?.map((limitation, i) => (
                      <HStack key={i}>
                        <ListItem>
                          <BodyLarge>{limitation}</BodyLarge>
                        </ListItem>
                      </HStack>
                    ))}
                  </List.Root>
                  {translations[lng].equation && (
                    <HStack>
                      <TitleMedium style={{ padding: "24px 0" }}>
                        {t("calculation-method")}
                      </TitleMedium>
                    </HStack>
                  )}
                  {translations[lng].equation && (
                    <Equation equation={translations[lng].equation} />
                  )}
                  {translations[lng].equations &&
                    translations[lng].equations.map((equation) => (
                      <Equation key={equation.label} equation={equation} />
                    ))}
                  {translations[lng].parameters && (
                    <HStack>
                      <TitleMedium style={{ padding: "24px 0" }}>
                        {t("explanation-of-parameters")}
                      </TitleMedium>
                    </HStack>
                  )}
                  {translations[lng].parameters && (
                    <div>
                      <table
                        style={{ width: "100%", borderCollapse: "collapse" }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                textAlign: "left",
                                padding: "12px",
                                borderBottom: "1px solid #eee",
                              }}
                            >
                              <ButtonSmall textTransform={"uppercase"}>
                                {t("parameter-code")}
                              </ButtonSmall>
                            </th>
                            <th
                              style={{
                                textAlign: "left",
                                padding: "12px",
                                borderBottom: "1px solid #eee",
                              }}
                            >
                              <ButtonSmall textTransform={"uppercase"}>
                                {t("parameter-description")}
                              </ButtonSmall>
                            </th>
                            <th
                              style={{
                                textAlign: "left",
                                padding: "12px",
                                borderBottom: "1px solid #eee",
                              }}
                            >
                              <ButtonSmall textTransform={"uppercase"}>
                                {t("units")}
                              </ButtonSmall>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {translations[lng].parameters.map(
                            (parameter, index) => (
                              <tr key={index}>
                                <td
                                  style={{
                                    padding: "12px",
                                    borderBottom: "1px solid #eee",
                                    color:
                                      "var(--chakra-colors-content-secondary)",
                                  }}
                                >
                                  <LatexEquation formula={parameter.code} />
                                </td>
                                <td
                                  style={{
                                    padding: "12px",
                                    borderBottom: "1px solid #eee",
                                  }}
                                >
                                  <BodyMedium>
                                    {parameter.description}
                                  </BodyMedium>
                                </td>
                                <td
                                  style={{
                                    padding: "12px",
                                    borderBottom: "1px solid #eee",
                                  }}
                                >
                                  <BodyMedium>
                                    {Array.isArray(parameter.units)
                                      ? parameter.units.join(", ")
                                      : parameter.units}
                                  </BodyMedium>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          );
        },
      )}
    </div>
  );
}
