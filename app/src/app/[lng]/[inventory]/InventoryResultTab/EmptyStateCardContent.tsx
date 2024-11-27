import { TFunction } from "i18next";
import { Center, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import { Link } from "@chakra-ui/next-js";

export const EmptyStateCardContent = ({
  t,
  inventoryId,
  width,
  height,
  isPublic,
}: {
  inventoryId: string | undefined;
  t: TFunction;
  width: string;
  height: string;
  isPublic: boolean;
}) => (
  <Center width={width} height={height}>
    <VStack width="400px" spacing={4}>
      <Image
        src="/assets/report_results_empty_state.svg"
        width={100}
        height={100}
        alt="Checkmark"
      />
      <Text
        fontWeight="600"
        fontSize="title.md"
        color="content.tertiary"
        fontFamily="heading"
      >
        {t("no-data-for-inventory-yet")}
      </Text>
      {!isPublic && (
        <Text>
          <span>{t("start-adding-data")} </span>
          <Link href={`/${inventoryId}/data`} color="blue.500">
            {t("add-data-to-inventory")}
          </Link>
        </Text>
      )}
    </VStack>
  </Center>
);
