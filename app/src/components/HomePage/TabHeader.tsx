import { TFunction } from "i18next";
import { Badge, Box, Flex, Heading, Link, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineAccountTree, MdOutlineCalendarToday } from "react-icons/md";
import type { InventoryResponse } from "@/util/types";
import { InventoryTypeEnum } from "@/util/constants";
import { Selector } from "@/components/selector";
import React, { useMemo } from "react";
import { api, useGetCitiesAndYearsQuery } from "@/services/api";
import { useRouter } from "next/navigation";

export function TabHeader({
  t,
  title,
  isPublic = false,
  inventory,
}: {
  t: TFunction<string, undefined>;
  title: string;
  isPublic?: boolean;
  inventory?: InventoryResponse;
}) {
  const { data: citiesAndYears, isLoading } = useGetCitiesAndYearsQuery();

  const [setUserInfo] = api.useSetUserInfoMutation();
  const router = useRouter();

  const targetYears = useMemo(() => {
    if (citiesAndYears && inventory) {
      return citiesAndYears.find(({ city }) => city.cityId === inventory.cityId)
        ?.years;
    }
  }, [citiesAndYears, inventory]);

  const onClick = (inventoryYear: string) => {
    const targetYear = targetYears?.find(
      (year) => year.year.toString() === inventoryYear,
    );

    setUserInfo({
      defaultInventoryId: targetYear?.inventoryId as string,
      cityId: inventory?.city.cityId as string,
    });

    router.push(`${isPublic ? "/public" : ""}/${targetYear?.inventoryId}`);
  };

  return (
    <>
      <Box className="flex items-center justify-between">
        <Box className="flex flex-col">
          <Box className="flex items-center gap-3">
            <Heading
              fontSize="headline.sm"
              fontWeight="semibold"
              lineHeight="32"
            >
              {t(title)}
            </Heading>
          </Box>
          <Box className="flex items-center gap-3">
            <Badge
              borderWidth="1px"
              borderColor="border.neutral"
              py={1}
              px={2}
              borderRadius="full"
              bg="base.light"
            >
              <Flex>
                <MdOutlineCalendarToday
                  size="20px"
                  style={{ marginRight: 1 }}
                />
                {t("year")}: {inventory?.year}
              </Flex>
            </Badge>
            <Badge
              borderWidth="1px"
              borderColor="border.neutral"
              py={1}
              px={2}
              borderRadius="full"
              bg="base.light"
            >
              <Flex>
                <MdOutlineAccountTree size="20px" style={{ marginRight: 1 }} />
                {inventory?.inventoryType === InventoryTypeEnum.GPC_BASIC_PLUS
                  ? t("inventory-format-basic+")
                  : t("inventory-format-basic")}
              </Flex>
            </Badge>
          </Box>
        </Box>
        {isPublic && (targetYears?.length as number) > 1 ? (
          <Box className="">
            <Selector
              options={
                targetYears?.map((year) => year.year.toString() as string) || []
              }
              value={inventory?.year?.toString() as string}
              onChange={(e) => onClick(e.target.value)}
              t={t}
            />
          </Box>
        ) : (
          <> </>
        )}
      </Box>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
        className="mt-3"
      >
        {" "}
        {!isPublic ? (
          <Trans
            i18nKey="gpc-inventory-description"
            values={{ year: inventory?.year }}
            t={t}
          >
            Track and review your {{ year: inventory?.year }} GHG Emission
            inventory data, prepared according to the Greenhouse Gas Protocol
            for Cities (GPC) Framework. The data you have submitted is now
            officially incorporated{" "}
            <Link
              href="https://ghgprotocol.org/ghg-protocol-cities"
              target="_blank"
              fontWeight="bold"
              color="brand.secondary"
            >
              Learn more
            </Link>{" "}
            about the GPC framework for the inventory calculation.
          </Trans>
        ) : (
          <Trans
            i18nKey="gpc-inventory-description-public"
            values={{ year: inventory?.year }}
            t={t}
          >
            Review the results of {{ year: inventory?.year }} GHG Emission
            Inventory, prepared according to the GPC Framework.{" "}
            <Link
              href="https://ghgprotocol.org/ghg-protocol-cities"
              target="_blank"
              fontWeight="bold"
              color="brand.secondary"
            >
              Learn more
            </Link>{" "}
            about the GPC framework.
          </Trans>
        )}
      </Text>
    </>
  );
}
