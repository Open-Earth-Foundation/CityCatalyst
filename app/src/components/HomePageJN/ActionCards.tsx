import type { TFunction } from "i18next";
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
  OrganizationWithThemeResponse,
} from "@/util/types";
import { MdArrowForward } from "react-icons/md";
import { AllProjectsIcon } from "../icons";
import ActionCardSmall from "./ActionCardSmall";
import { ButtonMedium } from "../package";

export function ActionCards({
  organization,
  lng,
  t,
  city,
}: {
  t: TFunction;
  organization: OrganizationWithThemeResponse;
  lng: string;
  city?: CityWithProjectDataResponse;
}) {
  const router = useRouter();
  return (
    <Box display="flex" gap={6} w="full">
      <Box display="flex" flexDirection="column" gap={2} w="full">
        <Grid
          templateColumns={{ base: "1fr", md: "2fr 1fr" }}
          templateRows={{ base: "auto", md: "1fr 1fr" }}
          gap={6}
          alignItems="stretch"
        >
          {/* Large blue card  - Check your dashboard CTA*/}
          <GridItem
            colSpan={1}
            rowSpan={{ base: 1, md: 2 }}
            bg="base.light"
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
            <Box>
              <HStack alignItems="center">
                <Icon as={MdBarChart} boxSize={6} color="interactive.control" />
                <Text fontWeight="bold" fontSize="xl">
                  {t("check-your-dashboard")}
                </Text>
              </HStack>
              <Text mt={2}>{t("check-your-dashboard-description")}</Text>
            </Box>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="flex-end"
              mt={4}
            >
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
                  borderWidth="2px"
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
          </GridItem>

          {/* Invite colleagues card */}
          <GridItem display="flex" alignItems="center" gap={4} minH={0} p={0}>
            <AddCollaboratorButton lng={lng} />
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
