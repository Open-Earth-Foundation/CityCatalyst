import type { TFunction } from "i18next";
import { Trans } from "react-i18next";
import { SUPPORT_EMAIL } from "@/util/constants";
import {
  Box,
  Text,
  Grid,
  GridItem,
  Icon,
  Link,
  HStack,
  Button,
} from "@chakra-ui/react";
import { AddCollaboratorButton } from "./AddCollaboratorButton";
import { MdBarChart } from "react-icons/md";

import { useRouter } from "next/navigation";
import {
  CityWithProjectDataResponse,
  InventoryResponse,
  OrganizationWithThemeResponse,
} from "@/util/types";
import { MdArrowForward } from "react-icons/md";
import { AllProjectsIcon } from "../icons";
import ActionCardSmall from "./ActionCardSmall";
import { useGetUserAccessStatusQuery } from "@/services/api";

export function ActionCards({
  organization,
  lng,
  t,
  city,
  ghgiCityData,
}: {
  t: TFunction;
  organization: OrganizationWithThemeResponse;
  lng: string;
  city?: CityWithProjectDataResponse;
  ghgiCityData?: InventoryResponse;
}) {
  const router = useRouter();
  const { data: accessStatus } = useGetUserAccessStatusQuery({});
  const isCollaborator =
    accessStatus?.isCollaborator &&
    !accessStatus?.isOrgOwner &&
    !accessStatus?.isProjectAdmin;
  const hasNoInventory = !ghgiCityData;
  return (
    <Box display="flex" gap={6} w="full">
      <Box display="flex" flexDirection="column" gap={2} w="full">
        <Grid
          templateColumns={{ base: "1fr", md: "2fr 1fr" }}
          templateRows={{ base: "auto", md: "1fr 1fr" }}
          gap={6}
          alignItems="stretch"
        >
          {/* Large card — nudge to create inventory if none exists, else dashboard CTA */}
          <GridItem
            colSpan={1}
            rowSpan={{ base: 1, md: 2 }}
            bg={isCollaborator && hasNoInventory ? "background.neutral" : "base.light"}
            borderRadius="lg"
            p={6}
            color="base.dark"
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
            minH={0}
            h="100%"
            borderWidth="2px"
            borderColor="border.neutral"
          >
            {isCollaborator && hasNoInventory ? (
              <Box>
                <Text fontWeight="bold" fontSize="xl" mb={2}>
                  {t("no-inventory-title")}
                </Text>
                <Text
                  color="base.dark"
                  fontFamily="body"
                  fontSize="body.lg"
                  fontWeight="normal"
                  lineHeight="24"
                  letterSpacing="wide"
                >
                  <Trans
                    t={t}
                    i18nKey="no-inventory-description"
                    values={{ supportEmail: SUPPORT_EMAIL }}
                    components={{
                      emailLink: (
                        <Link
                          href={`mailto:${SUPPORT_EMAIL}`}
                          color="content.link"
                          fontFamily="body"
                          fontSize="body.lg"
                          fontWeight="normal"
                          lineHeight="24"
                          letterSpacing="wide"
                          textDecoration="underline"
                        />
                      ),
                    }}
                  />
                </Text>
              </Box>
            ) : ghgiCityData ? (
              <>
                <Box>
                  <HStack alignItems="center">
                    <Icon as={MdBarChart} boxSize={6} color="interactive.control" />
                    <Text fontWeight="bold" fontSize="xl">
                      {t("check-your-dashboard")}
                    </Text>
                  </HStack>
                  <Text mt={2}>{t("check-your-dashboard-description")}</Text>
                </Box>
                <Box display="flex" alignItems="center" justifyContent="flex-end" mt={4}>
                  <Link
                    p={1}
                    href={
                      city
                        ? `/${lng}/cities/${city.cityId}/dashboard`
                        : `/${lng}/organization/${organization.organizationId}/dashboard`
                    }
                    color="base.dark"
                    fontWeight="bold"
                  >
                    <Button
                      variant="outline"
                      borderWidth="1px"
                      borderColor="border.neutral"
                      borderRadius="4xl"
                      px={6}
                      py={2}
                      color="base.dark"
                      fontWeight="bold"
                    >
                      {t("go-to-dashboard-cta")}
                      <Icon as={MdArrowForward} boxSize={5} color="content.link" />
                    </Button>
                  </Link>
                </Box>
              </>
            ) : (
              <>
                <Box>
                  <Text fontWeight="bold" fontSize="xl" color="content.link">
                    {t("get-started-ghg-title")}
                  </Text>
                  <Text mt={2}>{t("get-started-ghg-description")}</Text>
                </Box>
                <Box display="flex" alignItems="center" justifyContent="flex-end" mt={4}>
                  <Link
                    href={
                      city
                        ? `/${lng}/cities/${city.cityId}/GHGI/onboarding`
                        : `/${lng}/cities/onboarding`
                    }
                    color="content.link"
                    fontWeight="bold"
                    display="flex"
                    alignItems="center"
                    gap={2}
                    textTransform="uppercase"
                    letterSpacing="wider"
                    fontSize="sm"
                  >
                    {t("launch-ghg-inventories-cta")}
                    <Icon as={MdArrowForward} boxSize={5} />
                  </Link>
                </Box>
              </>
            )}
          </GridItem>

          {/* Invite colleagues card */}
          <GridItem display="flex" alignItems="center" gap={4} minH={0} p={0}>
            <AddCollaboratorButton
              lng={lng}
              organizationId={organization.organizationId}
            />
          </GridItem>

          {/* All projects card */}
          <GridItem display="flex" alignItems="center" gap={4} minH={0} p={0}>
            <ActionCardSmall
              onClick={() => {
                router.push(
                  `/${lng}/organization/${organization.organizationId}/project`,
                );
              }}
              icon={<AllProjectsIcon />}
              title={t("all-projects")}
              color="content.link"
            />
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}
