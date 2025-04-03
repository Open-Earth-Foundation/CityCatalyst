"use client";

import { Box, Heading, Link, Text } from "@chakra-ui/react";
import React from "react";
import { useTranslation } from "@/i18n/client";
import { useGetAllCitiesInSystemQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";

const CitiesPage = ({ params: { lng } }: { params: { lng: string } }) => {
  const { t } = useTranslation(lng, "admin");
  const { data, isLoading } = useGetAllCitiesInSystemQuery();

  console.log("data", data);

  if (isLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box className="pt-16 pb-16  w-[1090px] mx-auto px-4">
      <Link href="/" _hover={{ textDecoration: "none" }}>
        <Box
          display="flex"
          alignItems="center"
          gap="8px"
          color="content.tertiary"
        >
          <Text
            textTransform="capitalize"
            fontFamily="heading"
            fontSize="body.lg"
            fontWeight="normal"
          >
            {t("go-back")}
          </Text>
        </Box>
      </Link>
      <Heading
        fontSize="headline.lg"
        fontWeight="semibold"
        color="content.primary"
        mb={12}
        mt={2}
        className="w-full"
      >
        {t("cities-heading")}
      </Heading>
    </Box>
  );
};

export default CitiesPage;
