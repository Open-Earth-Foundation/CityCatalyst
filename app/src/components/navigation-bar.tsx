"use client";

import React, { useState, useMemo } from "react";
import { useTranslation } from "@/i18n/client";
import { languages } from "@/i18n/settings";
import {
  Box,
  Heading,
  HStack,
  Icon,
  IconButton,
  Link,
  Separator,
  Text,
} from "@chakra-ui/react";
import i18next from "i18next";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";

import { CircleFlag } from "react-circle-flags";
import { FiSettings } from "react-icons/fi";
import {
  MdApartment,
  MdArrowDropDown,
  MdArrowDropUp,
  MdAspectRatio,
  MdLogout,
  MdOpenInNew,
  MdOutlineMenu,
} from "react-icons/md";
import Cookies from "js-cookie";
import { useParams, useRouter } from "next/navigation";
import { api, useGetUserAccessStatusQuery } from "@/services/api";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { Avatar } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";
import { Roles } from "@/util/types";
import ProjectDrawer from "@/components/GHGIHomePage/ProjectDrawer";
import { TbSettingsCog } from "react-icons/tb";
import { useTheme } from "next-themes";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { Trans } from "react-i18next";
import JNDrawer from "./HomePage/JNDrawer";
import { getGhgiInventoryPath } from "@/util/ghgi-routes";
import { getCityHomePath, getDashboardPath } from "@/util/routes";
import { useRouteParams } from "@/hooks/useRouteParams";
import { getParamValue } from "@/util/helpers";

function countryFromLanguage(language: string) {
  return language == "en" ? "us" : language;
}

export function NavigationBar({
  lng,
  showNav = true,
  isPublic = false,
  showMenu = false,
  isAuth = false,
  children,
  restrictAccess,
}: {
  lng: string;
  showNav?: boolean;
  isPublic?: boolean;
  showMenu?: boolean;
  isAuth?: boolean;
  children?: React.ReactNode;
  restrictAccess?: boolean;
  isOrgOwner?: boolean;
}) {
  const params = useParams();
  const activeLng = getParamValue(params.lng) ?? lng;
  const { t } = useTranslation(activeLng, "navigation");
  const { organization, clearOrganization } = useOrganizationContext();
  const logoUrl = organization?.logoUrl;
  const isFrozen = organization != null && !organization.active;
  // Use custom hook to extract route params - more reliable for route changes
  const {
    cityId: cityIdFromRoute,
    inventoryId: inventoryIdFromRoute,
    pathname,
  } = useRouteParams();

  const { data: userAccessStatus } = useGetUserAccessStatusQuery(
    {},
    {
      skip: isPublic,
    },
  );

  const { data: session, status } = useSession();
  const { data: userInfo } = api.useGetUserInfoQuery();
  const router = useRouter();

  const onChangeLanguage = async (language: string) => {
    Cookies.set("i18next", language, { path: "/", sameSite: "strict" });
    await i18next.changeLanguage(language);

    const currentPath = pathname || location.pathname;
    const newPath = currentPath.replace(/^\/[a-z]{2}(?=\/|$)/, `/${language}`);
    router.replace(newPath);
    router.refresh();
  };

  // Derive the active module name from the current pathname
  const moduleName = useMemo(() => {
    if (!pathname) return null;
    if (pathname.includes("/GHGI")) return t("page-title-ghg-inventories");
    if (pathname.includes("/HIAP")) return t("page-title-hiap");
    if (pathname.includes("/dashboard")) return t("page-title-dashboard");
    return null;
  }, [pathname, t]);

  // Memoize city and inventory IDs to ensure they update when route changes
  const currentInventoryId = useMemo(
    () => inventoryIdFromRoute ?? userInfo?.defaultInventoryId,
    [inventoryIdFromRoute, userInfo?.defaultInventoryId],
  );
  const currentCityId = useMemo(
    () => cityIdFromRoute ?? userInfo?.defaultCityId ?? undefined,
    [cityIdFromRoute, userInfo?.defaultCityId],
  );

  // Memoize paths to recompute when pathname or IDs change
  const dashboardPath = useMemo(
    () => getDashboardPath(lng, currentCityId ?? ""),
    [lng, currentCityId],
  );
  const homePath = useMemo(
    () => getCityHomePath(lng, currentCityId ?? ""),
    [lng, currentCityId],
  );
  const { setTheme } = useTheme();

  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);

  const [userMenuHighlight, setUserMenuHighlight] = useState<string | null>();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  function logOut() {
    setTheme("blue_theme");
    clearOrganization();
    setTimeout(() => {
      signOut({ callbackUrl: "/auth/login", redirect: true });
    });
  }

  return (
    <Box display="flex" flexDirection="column" w="full">
      <Box
        display="flex"
        justifyContent="space-between"
        flexDirection="row"
        px={8}
        py={4}
        alignItems="center"
        gap={12}
        position="relative"
        zIndex={50}
        w="full"
        bgColor="content.alternative"
      >
        <Box
          display="flex"
          gap={6}
          flexShrink={logoUrl ? 0 : 1}
          w={logoUrl ? "250px" : "auto"}
          h={logoUrl ? "40px" : "auto"}
        >
          {showMenu && !isPublic && (
            <IconButton variant="ghost" onClick={() => setIsDrawerOpen(true)}>
              <Icon as={MdOutlineMenu} boxSize={8} />
            </IconButton>
          )}
          {logoUrl && !isAuth ? (
            <Link href={homePath}>
              <img
                src={logoUrl}
                alt="Org logo"
                style={{
                  objectFit: "cover",
                  height: "50px",
                  width: "250px",
                }}
              />
            </Link>
          ) : (
            <HStack display="flex" alignItems="center" gap={2}>
              {!isAuth && (
                <Link width={9} height={9} href={homePath}>
                  <Image
                    src="/assets/logo.svg"
                    width={36}
                    height={36}
                    alt="CityCatalyst logo"
                  />
                </Link>
              )}
              <Link href={homePath}>
                <Heading size="lg" color="base.light">
                  {t("title")}
                </Heading>
              </Link>
              {moduleName && (
                <>
                  <Separator
                    orientation="vertical"
                    height="5"
                    borderColor="base.light"
                  />
                  <Heading size="lg" color="base.light" fontWeight="normal">
                    {moduleName}
                  </Heading>
                </>
              )}
            </HStack>
          )}
        </Box>

        {/* Menu Items */}
        <Box display="flex" gap="48px" alignItems="center">
          {showNav && !isPublic && (
            <>
              {" "}
              <Link href={dashboardPath} variant={"nav" as "plain"}>
                <Heading size="md" ml={6}>
                  {t("dashboard")}
                </Heading>
              </Link>
              <Link
                variant={"nav" as "plain"}
                rel="help noopener"
                target="_blank"
                href="https://citycatalyst.openearth.org/learning-hub"
              >
                <Heading size="md" whiteSpace="nowrap">
                  {t("learning-hub")}
                </Heading>
                <Icon as={MdOpenInNew} boxSize={4} />
              </Link>
              <Separator
                orientation="vertical"
                height="6"
                backgroundColor="background.overlay"
              />
            </>
          )}
          {children}
          <Box display="flex">
            <Box display="flex">
              <MenuRoot
                onOpenChange={(details) => {
                  setLanguageMenuOpen(details.open);
                }}
                open={isLanguageMenuOpen}
                variant="solid"
              >
                <MenuTrigger asChild>
                  <Button
                    color="base.light"
                    minW="120px"
                    variant="ghost"
                    textTransform="none"
                    whiteSpace="nowrap"
                  >
                    <Box display="flex" alignItems="center" gap="3">
                      <CircleFlag
                        countryCode={
                          countryFromLanguage(i18next.language) === "pt"
                            ? "br"
                            : countryFromLanguage(i18next.language)
                        }
                        width="24"
                      />

                      <Text fontSize="title.md" fontWeight="bold">
                        {i18next.language.toUpperCase()}
                      </Text>

                      <Icon
                        as={
                          isLanguageMenuOpen ? MdArrowDropUp : MdArrowDropDown
                        }
                        boxSize={6}
                      />
                    </Box>
                  </Button>
                </MenuTrigger>
                <MenuContent minW="140px" zIndex={2000}>
                  {languages.map((language) => (
                    <MenuItem
                      value={language}
                      onClick={() => onChangeLanguage(language)}
                      key={language}
                    >
                      <Box display="flex" alignItems="center">
                        <CircleFlag
                          countryCode={
                            countryFromLanguage(language) === "pt"
                              ? "br"
                              : countryFromLanguage(language)
                          }
                          width="24"
                          style={{ marginRight: "16px" }}
                        />
                        <Text fontSize="title.md">
                          {language.toUpperCase()}
                        </Text>
                      </Box>
                    </MenuItem>
                  ))}
                </MenuContent>
              </MenuRoot>
            </Box>
            <Box>
              {!isPublic && status === "authenticated" && session.user && (
                <MenuRoot
                  onOpenChange={(details) => {
                    setUserMenuOpen(details.open);
                  }}
                  open={isUserMenuOpen}
                  variant="solid"
                  onHighlightChange={(value) =>
                    setUserMenuHighlight(value.highlightedValue)
                  }
                >
                  <MenuTrigger
                    asChild
                    minW="220px"
                    whiteSpace="nowrap"
                    textTransform="none"
                  >
                    <Button variant="ghost" ml={8}>
                      <Avatar
                        size="sm"
                        bg="interactive.connected"
                        color="base.light"
                        name={session.user?.name!}
                        src={session.user?.image!}
                      />
                      <Text
                        w="120px"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        fontSize="title.md"
                        fontWeight="bold"
                      >
                        {session.user?.name}
                      </Text>
                      <Icon
                        as={isUserMenuOpen ? MdArrowDropUp : MdArrowDropDown}
                        boxSize={6}
                      />
                    </Button>
                  </MenuTrigger>

                  <MenuContent
                    paddingTop="8px"
                    paddingBottom="8px"
                    shadow="2dp"
                    minW="150px"
                    display="flex"
                    flexDirection="column"
                    justifyContent="space-around"
                    minH="58px"
                    zIndex={2000}
                  >
                    {userInfo?.role === Roles.Admin && (
                      <>
                        <MenuItem
                          value="admin"
                          paddingTop="12px"
                          paddingBottom="12px"
                          px="16px"
                          onClick={() => router.push(`/${lng}/admin`)}
                        >
                          <Box display="flex" alignItems="center">
                            {" "}
                            <Icon
                              as={MdAspectRatio}
                              boxSize={6}
                              color={
                                userMenuHighlight === "admin"
                                  ? "background.neutral"
                                  : "content.alternative"
                              }
                              mr={4}
                            />
                            <Text fontSize="title.md">{t("admin")}</Text>
                          </Box>
                        </MenuItem>
                        <MenuItem
                          value="cities"
                          paddingTop="12px"
                          paddingBottom="12px"
                          px="16px"
                          onClick={() => router.push(`/${lng}/admin/cities`)}
                        >
                          <Box display="flex" alignItems="center">
                            <Icon
                              as={MdApartment}
                              boxSize={6}
                              color={
                                userMenuHighlight === "cities"
                                  ? "background.neutral"
                                  : "content.alternative"
                              }
                              mr={4}
                            />
                            <Text
                              textTransform={"capitalize"}
                              fontSize="title.md"
                            >
                              {t("cities")}
                            </Text>
                          </Box>
                        </MenuItem>
                      </>
                    )}

                    {!restrictAccess && (
                      <MenuItem
                        value="settings"
                        paddingTop="12px"
                        paddingBottom="12px"
                        px="16px"
                        onClick={() => router.push(`/${lng}/settings`)}
                      >
                        <Box display="flex" alignItems="center">
                          {" "}
                          <Icon
                            as={FiSettings}
                            boxSize={6}
                            color={
                              userMenuHighlight === "settings"
                                ? "background.neutral"
                                : "content.alternative"
                            }
                            mr={4}
                          />
                          <Text fontSize="title.md">{t("settings")}</Text>
                        </Box>
                      </MenuItem>
                    )}
                    <MenuItem
                      paddingTop="12px"
                      paddingBottom="12px"
                      value="log-out"
                      px="16px"
                      onClick={() => logOut()}
                    >
                      <Box display="flex" alignItems="center">
                        <Icon
                          as={MdLogout}
                          boxSize={6}
                          color={
                            userMenuHighlight === "log-out"
                              ? "background.neutral"
                              : "sentiment.negativeDefault"
                          }
                          mr={4}
                        />
                        <Text fontSize="title.md">{t("log-out")}</Text>
                      </Box>
                    </MenuItem>
                  </MenuContent>
                </MenuRoot>
              )}
            </Box>
          </Box>
        </Box>
        {/* JN Drawer */}
        {/* Should be shown if JN is enabled */}
        {hasFeatureFlag(FeatureFlags.JN_ENABLED) && (
          <JNDrawer
            lng={activeLng}
            currentCityId={currentCityId}
            organizationId={
              (organization?.organizationId ??
                userAccessStatus?.organizationId) as string
            }
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            onOpenChange={({ open }) => setIsDrawerOpen(open)}
          />
        )}
        {/* TODO: [ON-4452] Remove project drawer and replace with JN drawer after JN is live */}
        {/* Project Drawer */}
        {!hasFeatureFlag(FeatureFlags.JN_ENABLED) && (
          <ProjectDrawer
            lng={activeLng}
            currentInventoryId={currentInventoryId as string}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            onOpenChange={({ open }) => setIsDrawerOpen(open)}
          />
        )}
      </Box>
      {isFrozen && !isPublic && !isAuth && (
        <Box py={2} px={16} bg="sentiment.warningDefault" w="full" zIndex={50}>
          <Text color="content.primary" fontSize="body.lg">
            <Trans
              i18nKey="account-frozen-warning-text"
              values={{
                email:
                  process.env.NEXT_PUBLIC_SUPPORT_EMAILS?.split(",").join(
                    " or ",
                  ) || "info@openearth.org",
              }}
              t={t}
              components={{
                bold: <strong />,
              }}
            />
          </Text>
        </Box>
      )}
    </Box>
  );
}
