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
  MdCardTravel,
  MdCheck,
  MdLogout,
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
import { uniqueBy } from "@/util/array";
import { useTheme } from "next-themes";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { Trans } from "react-i18next";
import JNDrawer from "./HomePage/JNDrawer";
import { getCityHomePath } from "@/util/routes";
import { useRouteParams } from "@/hooks/useRouteParams";
import { getParamValue } from "@/util/helpers";
import { env } from "@/lib/runtime-env";
import {
  getActiveModuleSegment,
  resolveCitySwitchPath,
} from "@/util/module-navigation";
import { toaster } from "@/components/ui/toaster";

function countryFromLanguage(language: string) {
  return language == "en" ? "us" : language;
}

export function NavigationBar({
  lng,
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
  const { organization, setOrganization, clearOrganization } =
    useOrganizationContext();
  const logoUrl = organization?.logoUrl;
  const isFrozen = organization != null && !organization.active;
  // Use custom hook to extract route params - more reliable for route changes
  const { cityId: cityIdFromRoute, pathname } = useRouteParams();

  const { data: userAccessStatus } = useGetUserAccessStatusQuery(
    {},
    {
      skip: isPublic,
    },
  );

  const { data: session, status } = useSession();
  const { data: userInfo } = api.useGetUserInfoQuery();
  const { data: rawOrganizations } = api.useGetUserOrganizationsQuery(
    undefined,
    {
      skip: isPublic || status !== "authenticated",
    },
  );
  const organizations = useMemo(
    () =>
      rawOrganizations &&
      uniqueBy(rawOrganizations, (org) => org.organizationId),
    [rawOrganizations],
  );
  const [getProjects] = api.useLazyGetProjectsQuery();
  const [getProjectModulesTrigger] = api.useLazyGetProjectModulesQuery();
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
    const active = getActiveModuleSegment(pathname);
    switch (active?.segment) {
      case "GHGI":
        return t("page-title-ghg-inventories");
      case "HIAP":
        return t("page-title-hiap");
      case "dashboard":
        return t("page-title-dashboard");
      default:
        return null;
    }
  }, [pathname, t]);

  // Memoize city to ensure it updates when route changes
  const currentCityId = useMemo(
    () => cityIdFromRoute ?? userInfo?.defaultCityId ?? undefined,
    [cityIdFromRoute, userInfo?.defaultCityId],
  );

  // Memoize paths to recompute when pathname or IDs change
  const homePath = useMemo(
    () => getCityHomePath(lng, currentCityId ?? ""),
    [lng, currentCityId],
  );
  const { setTheme } = useTheme();

  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [isOrgMenuOpen, setOrgMenuOpen] = useState(false);

  const [userMenuHighlight, setUserMenuHighlight] = useState<string | null>();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const currentOrganizationName = organizations?.find(
    (org) => org.organizationId === organization?.organizationId,
  )?.name;

  async function onChangeOrganization(organizationId: string) {
    if (organizationId === organization?.organizationId) return;
    setOrganization({ organizationId });
    const projects = await getProjects({ organizationId })
      .unwrap()
      .catch(() => []);

    const targetProject = projects
      .flatMap((project) => project.cities.map((city) => ({ project, city })))
      .sort((a, b) => a.city.name.localeCompare(b.city.name))[0];

    if (!targetProject) {
      router.push(`/${lng}/cities/onboarding`);
      return;
    }

    const projectModules = await getProjectModulesTrigger(
      targetProject.project.projectId,
    )
      .unwrap()
      .catch(() => []);

    const { path, blockedModuleId } = resolveCitySwitchPath({
      pathname,
      lng,
      newCityId: targetProject.city.cityId,
      availableModuleIds: new Set(projectModules.map((mod) => mod.id)),
    });

    if (blockedModuleId) {
      const blockedModule = projectModules.find(
        (mod) => mod.id === blockedModuleId,
      );
      toaster.create({
        type: "info",
        title: t("module-unavailable-for-city", {
          module:
            blockedModule?.name?.[lng] || blockedModule?.name?.en || "",
        }),
      });
    }

    router.push(path);
  }

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
        px={{ base: 4, md: 8 }}
        py={4}
        alignItems="center"
        gap={{ base: 2, md: 12 }}
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
              <Image
                src={logoUrl}
                alt="Org logo"
                width={250}
                height={50}
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
              <Link href={homePath} display={{ base: "none", md: "block" }}>
                <Heading size="lg" color="base.light">
                  {t("title")}
                </Heading>
              </Link>
              {moduleName && (
                <Box display={{ base: "none", md: "flex" }} alignItems="center" gap={2}>
                  <Separator
                    orientation="vertical"
                    height="5"
                    borderColor="base.light"
                  />
                  <Heading size="lg" color="base.light" fontWeight="normal">
                    {moduleName}
                  </Heading>
                </Box>
              )}
            </HStack>
          )}
        </Box>

        {/* Menu Items */}
        <Box display="flex" gap={{ base: "12px", md: "48px" }} alignItems="center">
          {children}
          <Box display="flex" gap={{ base: "8px", md: "32px" }}>
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
                  minW="auto"
                  minH="48px"
                  variant="ghost"
                  textTransform="none"
                  whiteSpace="nowrap"
                  justifyContent="space-between"
                  px="8px"
                  gap="16px"
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

                    <Text
                      display={{ base: "none", md: "block" }}
                      fontSize="title.sm"
                      fontWeight="medium"
                      letterSpacing="wide"
                      lineHeight="20"
                    >
                      {i18next.language.toUpperCase()}
                    </Text>

                    <Icon
                      as={isLanguageMenuOpen ? MdArrowDropUp : MdArrowDropDown}
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
                      <Text fontSize="title.md">{language.toUpperCase()}</Text>
                    </Box>
                  </MenuItem>
                ))}
              </MenuContent>
            </MenuRoot>
            {organizations && organizations.length > 1 && (
              <Box display={{ base: "none", md: "flex" }}>
                <MenuRoot
                  onOpenChange={(details) => {
                    setOrgMenuOpen(details.open);
                  }}
                  open={isOrgMenuOpen}
                  variant="solid"
                >
                  <MenuTrigger asChild>
                    <Button
                      color="base.light"
                      minW="auto"
                      minH="48px"
                      variant="ghost"
                      textTransform="none"
                      whiteSpace="nowrap"
                      px="8px"
                      justifyContent="space-between"
                      gap="16px"
                    >
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        boxSize="32px"
                        borderRadius="full"
                        bg="interactive.connected"
                        color="base.light"
                      >
                        <Icon as={MdCardTravel} boxSize={4} />
                      </Box>
                      <Text
                        maxW="140px"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        fontSize="title.sm"
                        fontWeight="medium"
                        letterSpacing="wide"
                        lineHeight="20"
                      >
                        {currentOrganizationName}
                      </Text>
                      <Icon
                        as={isOrgMenuOpen ? MdArrowDropUp : MdArrowDropDown}
                        boxSize={6}
                      />
                    </Button>
                  </MenuTrigger>
                  <MenuContent minW="220px" zIndex={2000}>
                    {organizations.map((org) => (
                      <MenuItem
                        value={org.organizationId}
                        onClick={() => onChangeOrganization(org.organizationId)}
                        key={org.organizationId}
                      >
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          w="full"
                        >
                          <Text
                            fontSize="title.md"
                            overflow="hidden"
                            textOverflow="ellipsis"
                            whiteSpace="nowrap"
                          >
                            {org.name}
                          </Text>
                          {org.organizationId ===
                            organization?.organizationId && (
                            <Icon
                              as={MdCheck}
                              boxSize={5}
                              color="interactive.secondary"
                            />
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </MenuContent>
                </MenuRoot>
              </Box>
            )}
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
                  <MenuTrigger asChild whiteSpace="nowrap" textTransform="none">
                    <Button
                      variant="ghost"
                      px="8px"
                      minW={{ base: "auto", md: "220px" }}
                      minH="48px"
                    >
                      <Box display="flex" alignItems="center" gap="4">
                        <Avatar
                          height="32px"
                          width="32px"
                          bg="interactive.connected"
                          color="base.light"
                          name={session.user?.name ?? ""}
                          src={session.user?.image}
                        />
                        <Text
                          display={{ base: "none", md: "block" }}
                          w="120px"
                          overflow="hidden"
                          textOverflow="ellipsis"
                          whiteSpace="nowrap"
                          fontSize="title.sm"
                          fontWeight="medium"
                          letterSpacing="wide"
                          lineHeight="20"
                        >
                          {session.user?.name}
                        </Text>
                        <Icon
                          as={isUserMenuOpen ? MdArrowDropUp : MdArrowDropDown}
                          boxSize={6}
                        />
                      </Box>
                    </Button>
                  </MenuTrigger>

                  <MenuContent
                    paddingTop="8px"
                    paddingBottom="8px"
                    shadow="2dp"
                    minW="220px"
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
      </Box>
      {isFrozen && !isPublic && !isAuth && (
        <Box py={2} px={16} bg="sentiment.warningDefault" w="full" zIndex={50}>
          <Text color="content.primary" fontSize="body.lg">
            <Trans
              i18nKey="account-frozen-warning-text"
              values={{
                email:
                  env("NEXT_PUBLIC_SUPPORT_EMAILS")?.split(",").join(" or ") ||
                  "info@openearth.org",
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
