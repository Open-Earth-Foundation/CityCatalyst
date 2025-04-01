"use client";

import { useEffect, useState } from "react";
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
import ProjectDrawer from "@/components/HomePage/ProjectDrawer";

function countryFromLanguage(language: string) {
  return language == "en" ? "us" : language;
}

function logOut() {
  signOut({ callbackUrl: "/auth/login", redirect: true });
}

export function NavigationBar({
  lng,
  showNav = true,
  isPublic = false,
  showMenu = false,
  isAuth = false,
}: {
  lng: string;
  showNav?: boolean;
  isPublic?: boolean;
  showMenu?: boolean;
  isAuth?: boolean;
}) {
  const { t } = useTranslation(lng, "navigation");
  const { inventory: inventoryParam } = useParams();
  const inventoryIdFromParam = inventoryParam;
  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery((inventoryIdFromParam as string) || "default");

  const onChangeLanguage = (language: string) => {
    Cookies.set("i18next", language);
    const cookieLanguage = Cookies.get("i18next");

    if (cookieLanguage) {
      i18next.changeLanguage(cookieLanguage);
    }

    // change language in URL without reloading page
    const newPath = location.pathname.replace(/^\/[A-Za-z]+/, `/${language}`);
    history.replaceState(null, "", newPath);
  };

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
  const router = useRouter();
  const pathname = usePathname();
  const dashboardPath = `/${lng}/${inventoryIdFromParam ?? currentInventoryId}`;

  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);

  const [userMenuHighlight, setUserMenuHighlight] = useState<string | null>();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <Box
      className="flex flex-row px-8 py-4 align-middle space-x-12 items-center relative z-50"
      bgColor="content.alternative"
    >
      <Box className="flex" gap={6}>
        {showMenu && !isPublic && (
          <IconButton variant="ghost" onClick={() => setIsDrawerOpen(true)}>
            <Icon as={MdOutlineMenu} boxSize={8} />
          </IconButton>
        )}
        <Link width={9} height={9} href={dashboardPath}>
          <Image
            src="/assets/logo.svg"
            width={36}
            height={36}
            alt="CityCatalyst logo"
          />
        </Link>
        <Link href={dashboardPath}>
          <Heading size="lg" color="base.light">
            {t("title")}
          </Heading>
        </Link>
      </Box>
      <div className="w-full" />
      {showNav && !isPublic && (
        <>
          {" "}
          <Link href={dashboardPath}>
            <Heading color="base.light" size="md" className="opacity-75" ml={6}>
              {t("dashboard")}
            </Heading>
          </Link>
          <Link
            target="_blank"
            rel="help noopener noreferrer"
            href="https://citycatalyst.openearth.org/learning-hub"
          >
            <Heading
              color="base.light"
              size="md"
              className="opacity-75 !text-nowrap"
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
                      className="mr-4"
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
                className="whitespace-nowrap normal-case"
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
                minH="128px"
                zIndex={2000}
              >
                {userInfo?.role === Roles.Admin && (
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
                            : "content.tertiary"
                        }
                        mr={4}
                      />
                      <Text fontSize="title.md">{t("admin")}</Text>
                    </Box>
                  </MenuItem>
                )}
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
                          : "content.tertiary"
                      }
                      mr={4}
                    />
                    <Text fontSize="title.md">{t("settings")}</Text>
                  </Box>
                </MenuItem>
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
      <ProjectDrawer
        lng={lng}
        currentInventoryId={currentInventoryId as string}
        organizationId={inventory?.city?.project?.organizationId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenChange={({ open }) => setIsDrawerOpen(open)}
      />
    </Box>
  );
}
