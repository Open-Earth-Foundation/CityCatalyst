"use client";

import { useTranslation } from "@/i18n/client";
import { languages } from "@/i18n/settings";
import { TriangleDownIcon, TriangleUpIcon } from "@chakra-ui/icons";
import {
  Avatar,
  Box,
  Button,
  Divider,
  Heading,
  Icon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import i18next from "i18next";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import NextLink from "next/link";
import { CircleFlag } from "react-circle-flags";
import { FiSettings } from "react-icons/fi";
import { MdLogout } from "react-icons/md";
import Cookies from "js-cookie";
import { useParams } from "next/navigation";
import { api } from "@/services/api";
import { useEffect } from "react";

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
  return (
    <Box
      className="flex flex-row px-8 py-4 align-middle space-x-12 items-center relative z-50"
      bgColor="content.alternative"
    >
      <NextLink href={`/${inventory ? inventory : currentInventoryId}`}>
        <Image
          src="/assets/logo.svg"
          width={36}
          height={36}
          alt="CityCatalyst logo"
          className="mr-[56px]"
        />
      </NextLink>
      <NextLink href={`/${inventory ? inventory : currentInventoryId}`}>
        <Heading size="18" color="base.light">
          {t("title")}
        </Heading>
      </NextLink>
      <div className="w-full" />
      {showNav && !isPublic && (
        <>
          {" "}
          <NextLink href={`/${inventory ? inventory : currentInventoryId}`}>
            <Heading color="base.light" size="sm" className="opacity-75" ml={6}>
              {t("dashboard")}
            </Heading>
          </NextLink>
          <NextLink
            target="_blank"
            rel="help noopener noreferrer"
            href="https://citycatalyst.openearth.org/learning-hub"
          >
            <Heading
              color="base.light"
              size="sm"
              className="opacity-75 !text-nowrap"
              ml={6}
            >
              {t("learning-hub")}
            </Heading>
          </NextLink>
          <Divider orientation="vertical" h={6} />
        </>
      )}
      <Menu>
        {({ isOpen }) => (
          <>
            <MenuButton
              as={Button}
              variant="ghost"
              color="base.light"
              size="md"
              minW="120px"
              leftIcon={
                <CircleFlag
                  countryCode={
                    countryFromLanguage(i18next.language) === "pt"
                      ? "br"
                      : countryFromLanguage(i18next.language)
                  }
                  width="24"
                />
              }
              rightIcon={isOpen ? <TriangleUpIcon /> : <TriangleDownIcon />}
              className="whitespace-nowrap normal-case"
              _hover={{
                bg: "#FFF2",
              }}
              _active={{
                bg: "#FFF3",
              }}
            >
              {i18next.language.toUpperCase()}
            </MenuButton>
            <MenuList minW="140px" zIndex={2000}>
              {languages.map((language) => (
                <MenuItem
                  onClick={() => onChangeLanguage(language)}
                  key={language}
                >
                  <CircleFlag
                    countryCode={
                      countryFromLanguage(language) === "pt"
                        ? "br"
                        : countryFromLanguage(language)
                    }
                    width="24"
                    className="mr-4"
                  />
                  {language.toUpperCase()}
                </MenuItem>
              ))}
            </MenuList>
          </>
        )}
      </Menu>
      {!isPublic && status === "authenticated" && session.user && (
        <Menu>
          {({ isOpen }) => (
            <>
              <MenuButton
                as={Button}
                variant="ghost"
                color="base.light"
                size="md"
                minW="220px"
                leftIcon={
                  <Avatar
                    size="sm"
                    bg="interactive.connected"
                    color="base.light"
                    name={session.user?.name!}
                    src={session.user?.image!}
                  />
                }
                rightIcon={isOpen ? <TriangleUpIcon /> : <TriangleDownIcon />}
                className="whitespace-nowrap normal-case"
                _hover={{
                  bg: "#FFF2",
                }}
                _active={{
                  bg: "#FFF3",
                }}
              >
                <Text
                  w="120px"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {session.user?.name}
                </Text>
              </MenuButton>
              <MenuList
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
                <NextLink
                  href={`/${inventory ? inventory : currentInventoryId}/settings`}
                >
                  <MenuItem paddingTop="12px" paddingBottom="12px" px="16px">
                    <Icon
                      as={FiSettings}
                      boxSize={6}
                      color="content.tertiary"
                      mr={4}
                    />
                    {t("settings")}
                  </MenuItem>
                </NextLink>
                <MenuItem
                  paddingTop="12px"
                  paddingBottom="12px"
                  px="16px"
                  onClick={() => logOut()}
                >
                  <Icon
                    as={MdLogout}
                    boxSize={6}
                    color="sentiment.negativeDefault"
                    mr={4}
                  />
                  {t("log-out")}
                </MenuItem>
              </MenuList>
            </>
          )}
        </Menu>
      )}
    </Box>
  );
}
