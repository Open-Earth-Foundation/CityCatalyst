"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Cookies from "js-cookie";

import Footer from "@/components/Sections/Footer";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetMostRecentCityPopulationQuery,
  useGetModulesQuery,
  useGetProjectModulesQuery,
} from "@/services/api";
import { CheckUserSession } from "@/util/check-user-session";
import {
  Box,
  HStack,
  Image,
  VStack,
  Separator,
  Accordion,
  Icon,
} from "@chakra-ui/react";
import { Hero } from "./Hero";
import { ActionCards } from "./ActionCards";
import ProgressLoader from "@/components/ProgressLoader";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { HeadlineMedium } from "@/components/Texts/Headline";
import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
} from "@/components/ui/accordion";
import { ModuleCard } from "./ModuleCard";
import { BodyLarge } from "@/components/Texts/Body";
import { TitleLarge } from "@/components/Texts/Title";
import { LuChevronDown } from "react-icons/lu";
import { NoModulesCard } from "./NoModulesCard";
import { StageNames } from "@/util/constants";
import { stageOrder } from "@/config/stages";

export default function HomePage({
  lng,
  isPublic,
}: {
  lng: string;
  isPublic: boolean;
  cityId?: string;
}) {
  const { t } = useTranslation(lng, "dashboard");
  const cookieLanguage = Cookies.get("i18next");
  const router = useRouter();

  // Check if user is authenticated otherwise route to login page
  isPublic || CheckUserSession();
  const language = cookieLanguage ?? lng;
  const { cityId, year } = useParams();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // make sure that the inventory ID is using valid values
  let cityIdFromParam = (cityId as string) ?? userInfo?.defaultCityId;
  const parsedYear = parseInt(year as string);

  // If no city ID and no default city, redirect to cities onboarding
  useEffect(() => {
    if (!isUserInfoLoading && !cityIdFromParam) {
      router.push(`/${lng}/cities/onboarding`);
    }
  }, [isUserInfoLoading, cityIdFromParam, lng, router]);

  // query API data
  // TODO maybe rework this logic into one RTK query:
  // https://redux-toolkit.js.org/rtk-query/usage/customizing-queries#performing-multiple-requests-with-a-single-query

  const {
    data: city,
    isLoading: isCityLoading,
    error: cityError,
  } = api.useGetCityQuery(cityIdFromParam!, {
    skip: !cityIdFromParam,
  });

  const { data: population } = useGetMostRecentCityPopulationQuery(
    { cityId: cityIdFromParam! },
    { skip: !cityIdFromParam },
  );

  const { data: orgData, isLoading: isOrgDataLoading } =
    api.useGetOrganizationForCityQuery(cityIdFromParam!, {
      skip: !cityIdFromParam,
    });

  const { organization, setOrganization } = useOrganizationContext();
  const { setTheme } = useTheme();

  const { data: allModules, isLoading: isAllModulesLoading } =
    useGetModulesQuery();
  const { data: projectModules, isLoading: isProjectModulesLoading } =
    useGetProjectModulesQuery(city?.projectId!, { skip: !city?.projectId });

  const modulesByStage =
    allModules?.reduce(
      (acc, mod) => {
        if (!acc[mod.stage]) acc[mod.stage] = [];
        acc[mod.stage].push(mod);
        return acc;
      },
      {} as Record<string, typeof allModules>,
    ) ?? {};

  useEffect(() => {
    if (orgData) {
      const logoUrl = orgData?.logoUrl ?? null;
      const active = orgData?.active ?? true;

      if (
        organization?.logoUrl !== logoUrl ||
        organization?.active !== active
      ) {
        setOrganization({ logoUrl, active });
      }
      setTheme(orgData?.theme?.themeKey ?? "blue_theme");
    } else if (!isOrgDataLoading && !orgData) {
      setTheme("blue_theme");
    }
  }, [isOrgDataLoading, orgData, setTheme]);

  if (
    isOrgDataLoading ||
    isUserInfoLoading ||
    isAllModulesLoading ||
    isProjectModulesLoading
  ) {
    return <ProgressLoader />;
  }

  return (
    <>
      {cityIdFromParam && city && orgData && (
        <>
          <Hero
            city={city}
            year={parsedYear}
            isPublic={isPublic}
            isLoading={isOrgDataLoading || isCityLoading}
            t={t}
            population={population}
          />

          <Box display="flex" mx="auto" w="full" maxW="1090px">
            <VStack align="start" w="full">
              <ActionCards
                t={t}
                lng={language}
                organization={orgData}
                city={city}
              />
            </VStack>
          </Box>
          <Box
            h="full"
            w="full"
            maxW="1090px"
            pb="100px"
            bg="background.backgroundLight"
            px={8}
            mx="auto"
          >
            <HStack my={8}>
              <Image src="/assets/automation.svg" alt="" />
              <HeadlineMedium>{t("tools-title")}</HeadlineMedium>
            </HStack>
            <Separator borderColor="divider.neutral" borderWidth="2px" />
            {/* Accordions for stages */}
            {modulesByStage && projectModules && (
              <AccordionRoot multiple>
                {stageOrder.map((stage) => {
                  const modules = projectModules.filter((mod) => {
                    return mod.stage === stage;
                  });
                  return (
                    <AccordionItem key={stage} value={stage}>
                      <AccordionItemTrigger hideIndicator>
                        <HStack justify="flex-start" align="center" w="full">
                          <Box
                            as="span"
                            textAlign="left"
                            fontWeight="bold"
                            fontSize="xl"
                            display="flex"
                            flexDirection="row"
                          >
                            <Image
                              width={"24px"}
                              height={"24px"}
                              src={`/assets/stages/${stage}.svg`}
                              marginRight={2}
                              alt=""
                            />
                            <TitleLarge color="interactive.secondary">
                              {t("journey." + stage)}
                            </TitleLarge>
                          </Box>
                          <Accordion.ItemIndicator>
                            <Icon as={LuChevronDown} size="2xl" />
                          </Accordion.ItemIndicator>
                        </HStack>
                      </AccordionItemTrigger>
                      <AccordionItemContent>
                        <BodyLarge color="content.primary">
                          {t("journey." + stage + "-description")}
                        </BodyLarge>
                        <HStack mt={12} gap={6} align="start">
                          {modules && modules.length > 0 ? (
                            modules.map((mod) => (
                              <ModuleCard
                                key={mod.id}
                                t={t}
                                module={mod}
                                enabled={projectModules.some(
                                  (m) => m.id === mod.id,
                                )}
                                baseUrl={`/${lng}/cities/${cityIdFromParam}`}
                                language={language}
                              />
                            ))
                          ) : (
                            <NoModulesCard t={t} />
                          )}
                        </HStack>
                      </AccordionItemContent>
                    </AccordionItem>
                  );
                })}
              </AccordionRoot>
            )}
          </Box>
          <Footer lng={language} />
        </>
      )}
    </>
  );
}
