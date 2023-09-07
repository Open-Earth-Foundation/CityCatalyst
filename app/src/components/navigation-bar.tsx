"use client";

import { useTranslation } from "@/i18n/client";
import { Link } from "@chakra-ui/next-js";
import { Divider, Select, Text } from "@chakra-ui/react";
import i18next from "i18next";
import Image from "next/image";
import { ChangeEventHandler } from "react";
import NextLink from "next/link";

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

  return (
    <div className="flex flex-row space-between px-8 py-4 align-middle bg-[#001EA7] space-x-12">
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
        <Text size="18" color="white" className="font-bold mt-1">
          {t("title")}
        </Text>
      </NextLink>
      <div className="w-full" />
      {showNav && (
        <Link
          href="/"
          color="white"
          size="16"
          className="opacity-75 mt-1"
          ml={6}
        >
          {t("dashboard")}
        </Link>
      )}
      <Link
        href="/help"
        color="white"
        size="16"
        className="opacity-75 mt-1"
        ml={6}
      >
        {t("help")}
      </Link>
      <Divider orientation="vertical" />
      <Select
        variant="unstyled"
        onChange={onChangeLanguage}
        defaultValue={lng}
        minW={20}
        w={20}
        size="md"
        color="white"
        mt={1}
      >
        <option value="en">EN</option>
        <option value="de">DE</option>
        <option value="es">ES</option>
      </Select>
    </div>
  );
}
