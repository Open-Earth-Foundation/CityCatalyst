import { api, useGetCitiesAndYearsQuery } from "@/services/api";
import type { CityAndYearsResponse } from "@/util/types";
import { Center, Icon, IconButton, Spinner, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import {
  MdAdd,
  MdArrowDropDown,
  MdLocationOn,
  MdOutlineLocationOn,
} from "react-icons/md";
import { MenuRoot, MenuContent, MenuItem, MenuTrigger } from "./ui/menu";
import { Button } from "./ui/button";
import type { TFunction } from "i18next";
import { useState } from "react";

export const InventorySelect = ({
  t,
  currentInventoryId,
}: {
  t: TFunction;
  currentInventoryId?: string | null;
}) => {
  const router = useRouter();
  const goToOnboarding = () => router.push("/onboarding/setup");

  const { data: citiesAndYears, isLoading } = useGetCitiesAndYearsQuery();

  const [setUserInfo] = api.useSetUserInfoMutation();
  const onSelect = async ({ city, years }: CityAndYearsResponse) => {
    // get the latest inventory for the city
    let targetInventory = years[0];
    await setUserInfo({
      defaultCityId: city.cityId!,
      defaultInventoryId: targetInventory.inventoryId,
    }).unwrap();
    router.push(`/${targetInventory.inventoryId}`);
  };

  const [menuHighlight, setMenuHighlight] = useState<string | null>(null);

  return (
    <MenuRoot
      lazyMount
      variant="solid"
      onHighlightChange={(value) => setMenuHighlight(value.highlightedValue)}
    >
      <MenuTrigger asChild>
        <Button
          aria-label="Select inventory"
          variant="ghost"
          colorScheme="interactive.secondary"
          size="lg"
        >
          <MdArrowDropDown size={24} />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {isLoading && (
          <MenuItem value="" asChild>
            <Center>
              <Spinner size="sm" />
            </Center>
          </MenuItem>
        )}
        {citiesAndYears?.map(({ city, years }) => {
          const isCurrent = years.some(
            (y: { inventoryId: string }) =>
              y.inventoryId === currentInventoryId,
          );
          return (
            <MenuItem
              key={city.cityId}
              value={city.cityId}
              onClick={() => !isCurrent && onSelect({ city, years })}
            >
              <Text>
                {city.name}, {city.country}
              </Text>
            </MenuItem>
          );
        })}
        <MenuItem value="add-city" onClick={goToOnboarding}>
          <Icon
            as={MdAdd}
            color={
              menuHighlight === "add-city"
                ? "background.neutral"
                : "interactive.secondary"
            }
            boxSize={6}
          />
          {t("add-a-new-city")}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
};
