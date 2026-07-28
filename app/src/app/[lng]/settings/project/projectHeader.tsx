import { CityResponse, ProjectWithCities, UserRole } from "@/util/types";
import React, { useMemo } from "react";
import { Box, Button, HStack, Icon, Link, Text } from "@chakra-ui/react";
import { MdAdd } from "react-icons/md";
import { CircleFlag } from "react-circle-flags";
import { TFunction } from "i18next";
import { useRouter } from "next/navigation";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useUserPermissions } from "@/hooks/useUserPermissions";

interface ProjectHeaderProps {
  t: TFunction;
  lng: string;
  selectedProjectData: ProjectWithCities | null | undefined;
  selectedCityData: CityResponse | undefined;
  selectedInventory: {
    inventoryId: string;
    year: number;
  } | null;
  onSetSelectedCity: (value: string | null) => void;
  setSelectedInventory: (
    value: {
      inventoryId: string;
      year: number;
    } | null,
  ) => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  t,
  lng,
  selectedProjectData,
  selectedCityData,
  selectedInventory,
  onSetSelectedCity,
  setSelectedInventory,
}) => {
  const router = useRouter();

  const view = useMemo<"inventory-view" | "city-view" | "project-view">(() => {
    if (selectedCityData && selectedInventory) {
      return "inventory-view";
    }
    if (selectedCityData) {
      return "city-view";
    }
    return "project-view";
  }, [selectedCityData, selectedInventory]);

  const { isFrozenCheck, organization } = useOrganizationContext();
  const { userRole } = useUserPermissions({
    organizationId: organization?.organizationId,
  });

  return (
    <HStack justifyContent="space-between" alignItems="center" mb={6}>
      <Box>
        <Text
          onClick={() => {
            onSetSelectedCity(null);
            setSelectedInventory(null);
          }}
          mb="6"
          fontFamily="heading"
          fontWeight="bold"
          letterSpacing="widest"
          fontSize="title.md"
          color="content.secondary"
          truncate
          cursor="pointer"
        >
          {selectedProjectData?.name}
        </Text>
        {view !== "project-view" && (
          <HStack mt={2} gap={2}>
            <CircleFlag
              countryCode={
                selectedCityData?.countryLocode
                  ?.substring(0, 2)
                  .toLowerCase() || ""
              }
              width={24}
              height={24}
            />
            <Text
              fontWeight="bold"
              fontSize="title.lg"
              lineHeight="28"
              onClick={() => {
                onSetSelectedCity(selectedCityData?.cityId ?? null);
                setSelectedInventory(null);
              }}
            >
              {view === "inventory-view" ? (
                <Link>{selectedCityData?.name}</Link>
              ) : (
                <Text as="span">{selectedCityData?.name}</Text>
              )}
            </Text>
          </HStack>
        )}
      </Box>
      {view !== "inventory-view" && userRole == UserRole.ORG_ADMIN && (
        <Button
          onClick={() =>
            isFrozenCheck()
              ? null
              : router.push(
                  `/${lng}/cities/onboarding/setup?project=${selectedProjectData?.projectId as string}${selectedCityData?.cityId ? `&city=${selectedCityData?.cityId}` : ""}`,
                )
          }
          variant="outline"
          ml="auto"
          h="48px"
          mt="auto"
        >
          <Icon as={MdAdd} h={8} w={8} />
          {view === "project-view" ? t("add-city") : t("add-inventory")}
        </Button>
      )}
    </HStack>
  );
};

export default ProjectHeader;
