"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Box, VStack } from "@chakra-ui/react";
import { Roles } from "@/util/types";
import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { useSession } from "next-auth/react";
import HeadingText from "@/components/heading-text";
import { Button } from "@/components/ui/button";

export default function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "admin");
  const { children } = props;
  const router = useRouter();
  const { data } = useSession();

  const handleGoBack = () => {
    router.push(`/${lng}`);
  };

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar lng={lng} />
      <Box w="full" h="full">
        {data?.user?.role === Roles.Admin ? (
          children
        ) : (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="full"
            h={600}
            py={12}
          >
            <VStack spaceY="4">
              <HeadingText title={t("not-authorized")} />
              <Button onClick={handleGoBack}>{t("go-back")}</Button>
            </VStack>
          </Box>
        )}
      </Box>
    </Box>
  );
}
