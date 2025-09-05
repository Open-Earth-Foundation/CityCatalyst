import { TFunction } from "i18next";
import { Center, Link, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import { usePathname } from "next/navigation";

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
}) => {
  const pathname = usePathname();

  return (
    <Center width={width} height={height}>
      <VStack width="400px" spaceX={4} spaceY={4}>
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
            <Link href={`${pathname}/data`} color="blue.500">
              {t("add-data-to-inventory")}
            </Link>
          </Text>
        )}
      </VStack>
    </Center>
  );
};
