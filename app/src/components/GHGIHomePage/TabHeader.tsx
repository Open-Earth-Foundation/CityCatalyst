import { TFunction } from "i18next";
import { Badge, Box, Flex, Heading, Icon, Link, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import { MdOutlineAccountTree, MdOutlineCalendarToday } from "react-icons/md";
import type { InventoryResponse } from "@/util/types";
import { InventoryTypeEnum } from "@/util/constants";
import { Selector } from "@/components/selector";
import React, { useMemo } from "react";
import { api, useGetCitiesAndYearsQuery } from "@/services/api";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "../ui/button";
import { DataAlertIcon } from "../icons";

export function TabHeader({
  t,
  title,
  isPublic = false,
  inventory,
  showActionButtons = true,
}: {
  t: TFunction<string, undefined>;
  title: string;
  isPublic?: boolean;
  inventory?: InventoryResponse;
  showActionButtons?: boolean;
}) {
  const { data: citiesAndYears, isLoading } = useGetCitiesAndYearsQuery();

  const [setUserInfo] = api.useSetUserInfoMutation();
  const router = useRouter();
  const pathname = usePathname();

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
      defaultCityId: inventory?.city.cityId as string,
    });

    router.push(`${isPublic ? "/public" : ""}/${targetYear?.inventoryId}`);
  };

  return (
    <>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" flexDirection="column" w="full">
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={3}
            w="full"
          >
            <Heading
              fontSize="headline.sm"
              fontWeight="semibold"
              lineHeight="32"
              pb={3}
            >
              {t(title)}
            </Heading>
            {!isPublic && showActionButtons && (
              <Button
                variant={"outline"}
                p={6}
                onClick={() => router.push(`${pathname}/manage-sectors`)}
                display="flex"
                gap={0}
              >
                <Icon as={DataAlertIcon} boxSize={10} mt={3} />
                <Text>{t("manage-missing-subsectors")}</Text>
              </Button>
            )}
          </Box>
          <Box display="flex" alignItems="center" gap={3}>
            <Badge>
              <MdOutlineCalendarToday size="20px" style={{ marginRight: 1 }} />
              {t("year")}: {inventory?.year}
            </Badge>
            <Badge>
              <MdOutlineAccountTree size="20px" style={{ marginRight: 1 }} />
              {inventory?.inventoryType === InventoryTypeEnum.GPC_BASIC_PLUS
                ? t("inventory-format-basic+")
                : t("inventory-format-basic")}
            </Badge>
          </Box>
        </Box>
        {isPublic && (targetYears?.length as number) > 1 ? (
          <Box>
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
        mt={3}
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
              color="interactive.secondary"
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
              color="interactive.secondary"
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
