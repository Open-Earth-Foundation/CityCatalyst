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

export const InventorySelect = ({
  currentInventoryId,
}: {
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
      cityId: city.cityId!,
      defaultInventoryId: targetInventory.inventoryId,
    }).unwrap();
    router.push(`/${targetInventory.inventoryId}`);
  };

  return (
    <MenuRoot lazyMount>
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
              <Text color="base.dark">
                {city.name}, {city.country}
              </Text>
            </MenuItem>
          );
        })}
        <MenuItem value="" onClick={goToOnboarding}>
          <Icon as={MdAdd} color="interactive.secondary" boxSize={6} />
          Add a new city
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
};
