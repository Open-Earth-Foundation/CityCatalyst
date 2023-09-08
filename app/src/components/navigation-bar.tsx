"use client";

import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/next-js";
import { Avatar, Box, Divider, Heading, Select, Text } from "@chakra-ui/react";
import i18next from "i18next";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import NextLink from "next/link";
import { ChangeEventHandler } from "react";

export function NavigationBar({
  lng,
  showNav = true,
}: {
  lng: string;
  showNav?: boolean;
}) {
  const { t } = useTranslation(lng, "navigation");
  const onChangeLanguage: ChangeEventHandler<HTMLSelectElement> = (event) => {
    const newLng = event.target.value;
    i18next.changeLanguage(newLng);

    // change language in URL without reloading page
    const newPath = location.pathname.replace(/^\/[A-Za-z]+/, `/${newLng}`);
    history.replaceState("", "", newPath);
  };
  const { data: session, status } = useSession();

  return (
    <Box
      className="flex flex-row space-between px-8 py-4 align-middle space-x-12 items-center"
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
      <Select
        variant="unstyled"
        onChange={onChangeLanguage}
        defaultValue={lng}
        minW={20}
        w={20}
        size="md"
        color="base.light"
      >
        <option value="en">EN</option>
        <option value="de">DE</option>
        <option value="es">ES</option>
      </Select>
      {status === "authenticated" && session.user && (
        <div className="flex flex-row items-center cursor-pointer" onClick={() => signOut()}>
          <Avatar
            size="sm"
            bg="interactive.connected"
            color="base.light"
            mr={4}
            name={session.user.name!}
            src={session.user.image!}
          />
          <Heading size="sm" color="base.light" className="whitespace-nowrap">
            {session.user.name}
          </Heading>
        </div>
      )}
    </Box>
  );
}
