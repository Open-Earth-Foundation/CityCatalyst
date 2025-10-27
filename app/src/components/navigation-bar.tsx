"use client";

import React, { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/client";
import { languages } from "@/i18n/settings";
import {
  Box,
  Heading,
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
  MdOutlineMenu,
} from "react-icons/md";
import Cookies from "js-cookie";
import { useParams, usePathname, useRouter } from "next/navigation";
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
import { getDashboardPath, getHomePath } from "@/util/routes";

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
  const { t } = useTranslation(lng, "navigation");
  const { organization, clearOrganization } = useOrganizationContext();
  const logoUrl = organization?.logoUrl;
  const isFrozen = organization != null && !organization.active;
  const { inventory: inventoryParam, city: cityIdParam } = useParams();
  let inventoryIdFromParam = inventoryParam !== "null" ? inventoryParam : null;
  if (Array.isArray(inventoryIdFromParam)) {
    inventoryIdFromParam = inventoryIdFromParam[0];
  }
  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery(inventoryIdFromParam ?? "default");

  const { data: userAccessStatus } = useGetUserAccessStatusQuery(
    {},
    {
      skip: isPublic,
    },
  );
  const onChangeLanguage = (language: string) => {
    Cookies.set("i18next", language, { path: "/", sameSite: "strict" });
    const cookieLanguage = Cookies.get("i18next");

    if (cookieLanguage) {
      i18next.changeLanguage(cookieLanguage);
    }

    // Use Next.js router to properly handle language change with middleware
    const currentPath = pathname || location.pathname;
    const newPath = currentPath.replace(/^\/[a-z]{2}/, `/${language}`);
    router.replace(newPath);
  };

  // get pathname
  const pathname = usePathname();
  const fullPath = pathname.replace(/^\/[A-Za-z]+/, "");

  // Checks if language is set in cookie and updates URL if not
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (typeof window !== "undefined") {
        const handlePopState = () => {
          const cookieLanguage = Cookies.get("i18next");
          if (cookieLanguage) {
            const currentPath = window.location.pathname;
            // Your logic here
          }
        };

        window.addEventListener("popstate", handlePopState);

        // Cleanup the event listener on component unmount
        return () => {
          window.removeEventListener("popstate", handlePopState);
        };
      }
    }
  }, []);

  const { data: session, status } = useSession();
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  const currentInventoryId =
    inventoryIdFromParam ?? userInfo?.defaultInventoryId;
  const currentCityId = cityIdParam ?? userInfo?.defaultCityId;
  const router = useRouter();
  const inventoryStub = inventoryIdFromParam ?? currentInventoryId;
  const cityStub = cityIdParam ?? currentCityId;
  const dashboardPath = getDashboardPath(lng, cityStub, inventoryStub);
  const homePath = getHomePath(lng, cityStub, inventoryStub);
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
              <>
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
              </>
            )}
          </Box>
          <Box flex={1} />
        </Box>
        <Box flex={1} />
        {showNav && !isPublic && (
          <>
            {" "}
            <Link href={dashboardPath}>
              <Heading color="base.light" size="md" opacity={0.75} ml={6}>
                {t("dashboard")}
              </Heading>
            </Link>
            <Link
              rel="help noopener"
              href="https://citycatalyst.openearth.org/learning-hub"
            >
              <Heading
                color="base.light"
                size="md"
                opacity={0.75}
                whiteSpace="nowrap"
                ml={6}
              >
                {t("learning-hub")}
              </Heading>
            </Link>
            <Separator
              orientation="vertical"
              height="6"
              backgroundColor="black"
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
                        onClick={() => router.push(`/admin`)}
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
                        onClick={() => router.push(`/admin/cities`)}
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

                  {!restrictAccess && !userAccessStatus?.isOrgOwner && (
                    <MenuItem
                      value="settings"
                      paddingTop="12px"
                      paddingBottom="12px"
                      px="16px"
                      onClick={() =>
                        router.push(
                          `/${inventory ? inventory.inventoryId : currentInventoryId}/settings`,
                        )
                      }
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
                  {userAccessStatus?.isOrgOwner &&
                    !restrictAccess &&
                    hasFeatureFlag(FeatureFlags.ACCOUNT_SETTINGS_ENABLED) && (
                      <MenuItem
                        paddingTop="12px"
                        paddingBottom="12px"
                        value="account-settings"
                        px="16px"
                        onClick={() => {
                          router.push(
                            `/organization/${userAccessStatus.organizationId}/account-settings`,
                          );
                        }}
                      >
                        <Box display="flex" alignItems="center">
                          <Icon
                            as={TbSettingsCog}
                            boxSize={6}
                            color={
                              userMenuHighlight === "account-settings"
                                ? "background.neutral"
                                : "content.alternative"
                            }
                            mr={4}
                          />
                          <Text fontSize="title.md">
                            {t("account-settings")}
                          </Text>
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
        {/* JN Drawer */}
        {/* Should be shown if JN is enabled */}
        {hasFeatureFlag(FeatureFlags.JN_ENABLED) && (
          <JNDrawer
            lng={lng}
            currentInventoryId={currentInventoryId as string}
            organizationId={organization?.organizationId as string}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            onOpenChange={({ open }) => setIsDrawerOpen(open)}
          />
        )}
        {/* TODO: [ON-4452] Remove project drawer and replace with JN drawer after JN is live */}
        {/* Project Drawer */}
        {!hasFeatureFlag(FeatureFlags.JN_ENABLED) && (
          <ProjectDrawer
            lng={lng}
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
