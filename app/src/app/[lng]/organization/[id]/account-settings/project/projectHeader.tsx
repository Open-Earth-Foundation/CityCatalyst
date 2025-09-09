import { CityResponse, ProjectWithCities } from "@/util/types";
import React, { useEffect, useMemo } from "react";
import {
  Box,
  BreadcrumbItem,
  Button,
  Flex,
  HStack,
  Icon,
  Text,
} from "@chakra-ui/react";
import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";
import { MdAdd, MdChevronRight, MdOutlineFolder } from "react-icons/md";
import { CircleFlag } from "react-circle-flags";
import { TFunction } from "i18next";
import { useRouter } from "next/navigation";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

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

  const { isFrozenCheck } = useOrganizationContext();

  return (
    <HStack justifyContent="space-between" alignItems="center" mb={6}>
      <Box>
        <Box>
          <BreadcrumbRoot
            gap="8px"
            fontFamily="heading"
            fontWeight="bold"
            letterSpacing="widest"
            fontSize="14px"
            textTransform="uppercase"
            separator={
              <Icon
                as={MdChevronRight}
                boxSize={4}
                color="content.primary"
                h="32px"
              />
            }
          >
            <BreadcrumbItem>
              <BreadcrumbLink
                onClick={() => {
                  onSetSelectedCity(null);
                  setSelectedInventory(null);
                }}
                color="content.secondary"
                fontWeight="normal"
                truncate
                cursor="pointer"
                textTransform="capitalize"
              >
                {view === "project-view" ? (
                  <Text
                    fontSize="title.lg"
                    fontWeight="bold"
                    color="content.secondary"
                  >
                    {selectedProjectData?.name}
                  </Text>
                ) : (
                  <Text>{selectedProjectData?.name}</Text>
                )}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {selectedCityData && (
              <BreadcrumbItem>
                {view === "city-view" ? (
                  <BreadcrumbCurrentLink color="content.link">
                    {selectedCityData?.name}
                  </BreadcrumbCurrentLink>
                ) : (
                  <BreadcrumbLink
                    onClick={() => {
                      onSetSelectedCity(selectedCityData?.cityId as string);
                      setSelectedInventory(null);
                    }}
                    color="content.secondary"
                    fontWeight="normal"
                    truncate
                    cursor="pointer"
                    textTransform="capitalize"
                  >
                    {selectedCityData?.name}{" "}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            )}
            {selectedInventory && (
              <BreadcrumbCurrentLink color="content.link">
                <Text truncate lineClamp={1} textTransform="capitalize">
                  {t("ghg-inventory-year", { year: selectedInventory?.year })}
                </Text>
              </BreadcrumbCurrentLink>
            )}
          </BreadcrumbRoot>
        </Box>
        {view !== "project-view" && (
          <HStack mt={2} gap={2}>
            <CircleFlag
              countryCode={
                selectedCityData?.countryLocode
                  ?.substring(0, 2)
                  .toLowerCase() || ""
              }
              width={32}
            />
            <Text fontWeight="bold" fontSize="title.md" mb={2}>
              {selectedCityData?.name}
            </Text>
          </HStack>
        )}
      </Box>
      {view !== "inventory-view" && (
        <Button
          onClick={() =>
            isFrozenCheck()
              ? null
              : router.push(
                  `/${lng}/onboarding/setup?project=${selectedProjectData?.projectId as string}${selectedCityData?.cityId ? `&city=${selectedCityData?.cityId}` : ""}`,
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
