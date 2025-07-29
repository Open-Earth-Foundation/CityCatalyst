import type { TFunction } from "i18next";
import { Box, Text, Grid, GridItem, Icon, Link } from "@chakra-ui/react";
import { AddCollaboratorButton } from "@/components/HomePage/AddCollaboratorButton";
import { MdBarChart } from "react-icons/md";
import ActionCardSmall from "../HomePage/ActionCardSmall";
import { useRouter } from "next/navigation";
import { OrganizationWithThemeResponse } from "@/util/types";
import { MdArrowForward } from "react-icons/md";

export function ActionCards({
  organization,
  lng,
  t,
}: {
  t: TFunction;
  organization: OrganizationWithThemeResponse;
  lng: string;
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
            bg="content.link"
            borderRadius="lg"
            p={6}
            color="white"
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
            minH={0}
            h="100%"
          >
            <Box>
              <Icon as={MdBarChart} boxSize={6} mb={2} />
              <Text fontWeight="bold" fontSize="xl">
                {t("check-your-dashboard")}
              </Text>
              <Text mt={2}>{t("check-your-dashboard-description")}</Text>
            </Box>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="flex-end"
              mt={4}
            >
              <Link
                href={`/${lng}/organization/${organization.organizationId}/dashboard`}
                color="white"
                fontWeight="bold"
                _hover={{ textDecoration: "underline" }}
              >
                {t("go-to-dashboard-cta")}
                <Icon as={MdArrowForward} boxSize={8} />
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
                  `/${lng}/organization/${organization.organizationId}/projects`,
                );
              }}
              icon={<MdBarChart className="text-white" size={24} />}
              title={t("all-projects")}
            />
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}
