"use client";
import { use, useEffect, useState } from "react";

import { useTranslation } from "@/i18n/client";
import {
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AccountSettingsTab from "./account";
import TeamSettings from "./team";
import ProjectSettings from "./project/index";
import MyTokensTab from "@/app/[lng]/settings/my-tokens-tab";
import { api } from "@/services/api";
import { Roles } from "@/util/types";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import MyAppsTab from "@/app/[lng]/settings/my-apps-tab";
import { FiArrowLeft, FiX } from "react-icons/fi";
import { BiInfoCircle } from "react-icons/bi";

const PREFERENCES_INFO_DISMISSED_KEY = "settings-preferences-info-dismissed";

// TODO create tabs component with recipe
const AccountSettingsPage = (props: { params: Promise<{ lng: string }> }) => {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "settings");
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "account";

  const { data: userInfo } = api.useGetUserInfoQuery();
  const isAdmin = userInfo?.role === Roles.Admin;
  const [showPreferencesInfo, setShowPreferencesInfo] = useState(false);

  useEffect(() => {
    if (!userInfo?.userId) {
      return;
    }

    const storageKey = `${PREFERENCES_INFO_DISMISSED_KEY}-${userInfo.userId}`;
    const dismissed = localStorage.getItem(storageKey) === "true";
    setShowPreferencesInfo(!dismissed);
  }, [userInfo?.userId]);

  const dismissPreferencesInfo = () => {
    if (userInfo?.userId) {
      localStorage.setItem(
        `${PREFERENCES_INFO_DISMISSED_KEY}-${userInfo.userId}`,
        "true",
      );
    }
    setShowPreferencesInfo(false);
  };

  // TODO enable this when global organization dropdown exists
  /*
  const { data: orgData, isLoading: isOrgDataFetching } =
    api.useGetOrganizationQuery(id, {
      skip: !id,
    });

  const { setOrganization, organization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (orgData) {
      const newOrgState = normalizeOrganizationState(orgData);

      if (hasOrganizationChanged(organization, newOrgState)) {
        setOrganization(newOrgState);
      }
      setTheme(orgData?.theme?.themeKey ?? "blue_theme");
    } else {
      setTheme("blue_theme");
    }
  }, [isOrgDataFetching, orgData, organization, setOrganization, setTheme]);
  */

  return (
    <Box pt={16} pb={16} w="1090px" maxW="full" mx="auto" px={4}>
      <Link href={`/${lng}`}>
        <Button
          display="flex"
          alignItems="center"
          gap="8px"
          color="content.link"
          fontFamily="heading"
          fontSize="button.md"
          variant="ghost"
        >
          <Icon as={FiArrowLeft} />
          {t("go-back")}
        </Button>
      </Link>
      <Box w="full" mt="16px">
        <Text
          color="content.primary"
          fontWeight="bold"
          lineHeight="40"
          mt={2}
          fontSize="headline.lg"
          fontFamily="heading"
        >
          {t("settings")}
        </Text>
        {showPreferencesInfo && (
          <HStack
            w="full"
            bg="background.info"
            p="12px"
            my="40px"
            borderRadius="6px"
            justifyContent="space-between"
            alignItems="center"
          >
            <HStack gap="8px" alignItems="center">
              <Icon
                as={BiInfoCircle}
                color="content.alternative"
                boxSize="18px"
                mt="1px"
              />

              <VStack alignItems="flex-start" gap="4px">
                <Text
                  fontSize="body.md"
                  fontFamily="body"
                  fontWeight="semibold"
                  lineHeight="16px"
                >
                  {t("preferences-info-update-title")}
                </Text>
                <Text
                  fontSize="body.sm"
                  fontWeight="normal"
                  fontFamily="body"
                  lineHeight="14px"
                >
                  {t("preferences-info-update-description")}
                </Text>
              </VStack>
            </HStack>
            <IconButton
              aria-label="Close"
              variant="ghost"
              size="sm"
              minW="auto"
              h="auto"
              p="0"
              color="content.alternative"
              onClick={dismissPreferencesInfo}
            >
              <Icon as={FiX} boxSize="18px" />
            </IconButton>
          </HStack>
        )}
        <Box marginTop="48px" borderBottomColor={"border.overlay"}>
          <Tabs.Root defaultValue={initialTab} variant="enclosed">
            <Tabs.List
              p={0}
              w="full"
              backgroundColor="background.backgroundLight"
              mb="24px"
            >
              <Tabs.Trigger
                value="account"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                  backgroundColor: "background.backgroundLight",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("account")}
                </Text>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="team"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                  backgroundColor: "background.backgroundLight",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("team")}
                </Text>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="project"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                  backgroundColor: "background.backgroundLight",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("projects")}
                </Text>
              </Tabs.Trigger>
              {isAdmin && (
                <Tabs.Trigger
                  value="my-tokens"
                  _selected={{
                    borderColor: "content.link",
                    borderBottomWidth: "2px",
                    boxShadow: "none",
                    fontWeight: "bold",
                    borderRadius: "0",
                    color: "content.link",
                    backgroundColor: "background.backgroundLight",
                  }}
                >
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("api-tokens")}
                  </Text>
                </Tabs.Trigger>
              )}
              {isAdmin && hasFeatureFlag(FeatureFlags.OAUTH_ENABLED) && (
                <Tabs.Trigger
                  value="my-apps"
                  _selected={{
                    borderColor: "content.link",
                    borderBottomWidth: "2px",
                    boxShadow: "none",
                    fontWeight: "bold",
                    borderRadius: "0",
                    color: "content.link",
                    backgroundColor: "background.backgroundLight",
                  }}
                >
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("apps")}
                  </Text>
                </Tabs.Trigger>
              )}
            </Tabs.List>
            <Tabs.Content value="account">
              <AccountSettingsTab t={t} />
            </Tabs.Content>
            <Tabs.Content value="team">
              <TeamSettings
                lng={lng}
                initialProjectId={searchParams.get("project")}
                initialCityId={searchParams.get("city")}
              />
            </Tabs.Content>
            <Tabs.Content value="project">
              <ProjectSettings lng={lng} />
            </Tabs.Content>
            {isAdmin && <MyTokensTab lng={lng} />}
            {isAdmin && hasFeatureFlag(FeatureFlags.OAUTH_ENABLED) && (
              <MyAppsTab lng={lng} />
            )}
          </Tabs.Root>
        </Box>
      </Box>
    </Box>
  );
};

export default AccountSettingsPage;
