import { api, useGetCitiesAndYearsQuery } from "@/services/api";
import type { CitiesAndYearsResponse } from "@/util/types";
import {
  Center,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import {
  MdAdd,
  MdArrowDropDown,
  MdLocationOn,
  MdOutlineLocationOn,
} from "react-icons/md";
import { useEffect } from "react";

export const InventorySelect = ({
  currentInventoryId,
}: {
  currentInventoryId?: string | null;
}) => {
  const router = useRouter();
  const goToOnboarding = () => router.push("/onboarding/setup");

  const { data: inventories, isLoading } = api.useGetUserInventoriesQuery();
  // fetch the cities and years for the user's inventories

  const { data: citiesAndYears } = useGetCitiesAndYearsQuery();

  useEffect(() => {
    console.log(citiesAndYears, "this is the cities and years");
  }, [citiesAndYears]);

  const [setUserInfo] = api.useSetUserInfoMutation();
  const onSelect = async ({ city, years }: CitiesAndYearsResponse) => {
    // get the latest inventory for the city
    const targetInventory = years.sort((a, b) => b.year - a.year)[0];
    await setUserInfo({
      cityId: city.cityId!,
      defaultInventoryId: targetInventory.inventoryId,
    }).unwrap();
    router.push(`/${targetInventory.inventoryId}`);
  };

  return (
    <Menu isLazy={true}>
      <MenuButton as={IconButton} icon={<MdArrowDropDown size={24} />} />
      <MenuList>
        {isLoading && (
          <MenuItem>
            <Center>
              <Spinner size="sm" />
            </Center>
          </MenuItem>
        )}
        {citiesAndYears?.map(({ city, years }) => {
          const isCurrent = years.some(
            (y) => y.inventoryId === currentInventoryId,
          );
          return (
            <MenuItem
              key={city.cityId}
              icon={
                <Icon
                  as={isCurrent ? MdLocationOn : MdOutlineLocationOn}
                  color="interactive.secondary"
                  boxSize={6}
                />
              }
              onClick={() => !isCurrent && onSelect({ city, years })}
            >
              <Text color="base.dark">
                {city.name}, {city.country}
              </Text>
            </MenuItem>
          );
        })}
        <MenuItem
          onClick={goToOnboarding}
          icon={<Icon as={MdAdd} color="interactive.secondary" boxSize={6} />}
        >
          Add a new city
        </MenuItem>
      </MenuList>
    </Menu>
  );
};
