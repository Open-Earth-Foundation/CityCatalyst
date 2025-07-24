"use client";

import React, { useEffect } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import Cookies from "js-cookie";

import Footer from "@/components/Sections/Footer";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetCityPopulationQuery,
  useGetModulesQuery,
  useGetProjectModulesQuery,
} from "@/services/api";
import { CheckUserSession } from "@/util/check-user-session";
import { Box, HStack, Image, VStack } from "@chakra-ui/react";
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

  // Check if user is authenticated otherwise route to login page
  isPublic || CheckUserSession();
  const language = cookieLanguage ?? lng;
  const { cityId, year } = useParams();
  const getTranslationInLanguage = (obj: { [lng: string]: string }) => {
    // 3rd party developers might not add a translation for all the languages,
    // try to use the user's language, then fallback to English, then fallback to the first language
    return obj[language] || obj.en || Object.keys(obj)[0];
  };
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // make sure that the inventory ID is using valid values
  let cityIdFromParam = (cityId as string) ?? userInfo?.defaultCityId;
  const parsedYear = parseInt(year as string);

  // query API data
  // TODO maybe rework this logic into one RTK query:
  // https://redux-toolkit.js.org/rtk-query/usage/customizing-queries#performing-multiple-requests-with-a-single-query

  const { data: city, isLoading: isCityLoading } = api.useGetCityQuery(
    cityIdFromParam!,
    {
      skip: !cityIdFromParam,
    },
  );

  const { data: population } = useGetCityPopulationQuery(
    { cityId: cityIdFromParam!, year: parsedYear },
    { skip: !cityIdFromParam || !parsedYear },
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

  const modulesByStep = Object.entries(
    allModules?.reduce(
      (acc, mod) => {
        if (!acc[mod.step]) acc[mod.step] = [];
        acc[mod.step].push(mod);
        return acc;
      },
      {} as Record<string, typeof allModules>,
    ) ?? [],
  );

  useEffect(() => {
    if (orgData) {
      const logoUrl = orgData?.logoUrl ?? null;
      const active = orgData?.active ?? true;

      if (organization.logoUrl !== logoUrl || organization.active !== active) {
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
              <ActionCards t={t} lng={language} organization={orgData} />
            </VStack>
          </Box>
          <Box
            h="full"
            w="full"
            maxW="1090px"
            pt="48px"
            pb="100px"
            bg="background.backgroundLight"
            px={8}
            mx="auto"
          >
            <HStack mb={8}>
              <Image src="/assets/automation.svg" />
              <HeadlineMedium>{t("tools-title")}</HeadlineMedium>
            </HStack>
            {/* Accordions for steps */}
            {modulesByStep && projectModules && (
              <AccordionRoot multiple>
                {modulesByStep.map(([step, modules]) => (
                  <AccordionItem key={step} value={step}>
                    <AccordionItemTrigger>
                      <Box
                        as="span"
                        flex="1"
                        textAlign="left"
                        fontWeight="bold"
                        fontSize="xl"
                      >
                        {t("journey." + step)}
                      </Box>
                    </AccordionItemTrigger>
                    <AccordionItemContent>
                      <HStack gap={6} align="start">
                        {modules.map((mod) => (
                          <ModuleCard
                            key={mod.id}
                            t={t}
                            lng={language}
                            name={getTranslationInLanguage(mod.name)}
                            description={getTranslationInLanguage(
                              mod.description ?? {},
                            )}
                            author={mod.author}
                            url={mod.url}
                            enabled={projectModules.some(
                              (m) => m.id === mod.id,
                            )}
                          />
                        ))}
                      </HStack>
                    </AccordionItemContent>
                  </AccordionItem>
                ))}
              </AccordionRoot>
            )}
          </Box>
          <Footer lng={language} />
        </>
      )}
    </>
  );
}
