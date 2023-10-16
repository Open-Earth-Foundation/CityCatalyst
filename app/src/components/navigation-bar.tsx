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
} from "@chakra-ui/react";
import i18next from "i18next";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import NextLink from "next/link";
import { CircleFlag } from "react-circle-flags";
import { FiSettings } from "react-icons/fi";
import { MdLogout } from "react-icons/md";

function countryFromLanguage(language: string) {
  return language == "en" ? "us" : language;
}

export function NavigationBar({
  lng,
  showNav = true,
}: {
  lng: string;
  showNav?: boolean;
}) {
  const { t } = useTranslation(lng, "navigation");
  const onChangeLanguage = (language: string) => {
    i18next.changeLanguage(language);

    // change language in URL without reloading page
    const newPath = location.pathname.replace(/^\/[A-Za-z]+/, `/${language}`);
    history.replaceState("", "", newPath);
  };
  const { data: session, status } = useSession();

  return (
    <Box
      className="flex flex-row px-8 py-4 align-middle space-x-12 items-center"
      bgColor="content.alternative"
    >
      <NextLink href="/">
        <Image
          src="/assets/logo.svg"
          width={36}
          height={36}
          alt="CityCatalyst logo"
          className="mr-[56px]"
        />
      </NextLink>
      <NextLink href="/">
        <Heading size="18" color="base.light">
          {t("title")}
        </Heading>
      </NextLink>
      <div className="w-full" />
      {showNav && (
        <NextLink href="/">
          <Heading color="base.light" size="sm" className="opacity-75" ml={6}>
            {t("dashboard")}
          </Heading>
        </NextLink>
      )}
      <NextLink href="/help">
        <Heading color="base.light" size="sm" className="opacity-75" ml={6}>
          {t("help")}
        </Heading>
      </NextLink>
      <Divider orientation="vertical" h={6} />
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
                  countryCode={countryFromLanguage(i18next.language)}
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
                    countryCode={countryFromLanguage(language)}
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
      {status === "authenticated" && session.user && (
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
                {session.user?.name}
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
                <Link href="/settings">
                  <MenuItem
                    paddingTop="12px"
                    paddingBottom="12px"
                    paddingLeft="16px"
                    paddingRight="16px"
                  >
                    <Icon
                      as={FiSettings}
                      boxSize={6}
                      color="content.tertiary"
                      mr={4}
                    />
                    {t("settings")}
                  </MenuItem>
                </Link>
                <MenuItem
                  paddingTop="12px"
                  paddingBottom="12px"
                  paddingLeft="16px"
                  paddingRight="16px"
                  onClick={() => signOut()}
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
