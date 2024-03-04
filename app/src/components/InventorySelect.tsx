import { api } from "@/services/api";
import type { InventoryWithCity } from "@/util/types";
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

export const InventorySelect = ({
  currentInventoryId,
}: {
  currentInventoryId?: string | null;
}) => {
  const router = useRouter();
  const goToOnboarding = () => router.push("/onboarding/setup");

  const { data: inventories, isLoading } = api.useGetUserInventoriesQuery();
  const [setUserInfo] = api.useSetUserInfoMutation();
  const onSelect = async (inventory: InventoryWithCity) => {
    await setUserInfo({
      cityId: inventory.cityId!,
      defaultInventoryId: inventory.inventoryId,
    }).unwrap();
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
        {inventories?.map((inventory) => {
          const isCurrent = inventory.inventoryId === currentInventoryId;
          // const color = isCurrent ? "interactive.secondary" : "base.light";
          return (
            <MenuItem
              key={inventory.inventoryId}
              icon={
                <Icon
                  as={isCurrent ? MdLocationOn : MdOutlineLocationOn}
                  color="interactive.secondary"
                  boxSize={6}
                />
              }
              onClick={() => !isCurrent && onSelect(inventory)}
            >
              <Text color="base.dark">
                {inventory.city.name}, {inventory.year}
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
