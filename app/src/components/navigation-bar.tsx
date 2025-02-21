"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n/client";
import { languages } from "@/i18n/settings";
import { Box, Heading, Icon, Link, Separator, Text } from "@chakra-ui/react";
import i18next from "i18next";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";

import { CircleFlag } from "react-circle-flags";
import { FiSettings } from "react-icons/fi";
import { MdArrowDropUp, MdArrowDropDown, MdLogout } from "react-icons/md";
import Cookies from "js-cookie";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { Avatar } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";

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
}: {
  lng: string;
  showNav?: boolean;
  isPublic?: boolean;
}) {
  const { t } = useTranslation(lng, "navigation");
  const { inventory } = useParams();
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
  window.addEventListener("popstate", () => {
    const cookieLanguage = Cookies.get("i18next");
    if (cookieLanguage) {
      const currentPath = location.pathname;

      if (!currentPath.startsWith(`/${cookieLanguage}`)) {
        const newPath = currentPath.replace(
          /^\/[A-Za-z]+/,
          `/${cookieLanguage}`,
        );
        history.replaceState(null, "", newPath);
      }
    }
  });

  const { data: session, status } = useSession();
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  const currentInventoryId = userInfo?.defaultInventoryId;
  const router = useRouter();
  const dashboardPath = `/${lng}/${inventory ?? currentInventoryId}`;

  const [isUserMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <Box
      className="flex flex-row px-8 py-4 align-middle space-x-12 items-center relative z-50"
      bgColor="content.alternative"
    >
      <Link href={dashboardPath}>
        <Image
          src="/assets/logo.svg"
          width={36}
          height={36}
          alt="CityCatalyst logo"
          className="mr-[56px]"
        />
      </Link>
      <Link href={dashboardPath}>
        <Heading size="lg" color="base.light">
          {t("title")}
        </Heading>
      </Link>
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
          <MenuRoot>
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
              variant="subtle"
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
                height="128px"
                zIndex={2000}
              >
                <MenuItem
                  value="settings"
                  paddingTop="12px"
                  paddingBottom="12px"
                  px="16px"
                  onClick={() =>
                    router.push(
                      `/${inventory ? inventory : currentInventoryId}/settings`,
                    )
                  }
                >
                  <Box display="flex" alignItems="center">
                    {" "}
                    <Icon
                      as={FiSettings}
                      boxSize={6}
                      color="content.tertiary"
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
                      color="sentiment.negativeDefault"
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
  );
}
