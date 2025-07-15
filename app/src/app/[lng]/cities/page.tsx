"use client";
import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  Link,
  Table,
  Text,
} from "@chakra-ui/react";
import React, { useMemo, useState, use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetAllCitiesInSystemQuery,
  useGetOrganizationsQuery,
} from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import DataTable from "@/components/ui/data-table";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { MdMoreVert, MdOutlineGroup } from "react-icons/md";
import MoveCityModal from "@/app/[lng]/cities/MoveCityModal";
import { CityWithProjectDataResponse } from "@/util/types";

const CitiesPage = (props: { params: Promise<{ lng: string }> }) => {
  const { lng } = use(props.params);
  const { t } = useTranslation(lng, "admin");
  const { data, isLoading } = useGetAllCitiesInSystemQuery({});
  const { data: organizationData, isLoading: isLoadingOrganizationData } =
    useGetOrganizationsQuery({});

  const transformedCitiesData = useMemo(() => {
    if (!data) return [];
    return data.map((city) => {
      return {
        ...city,
        orgName: city.project?.organization?.name,
        orgEmail: city.project?.organization?.contactEmail,
      };
    });
  }, [data]);

  const [selectedRowKeys, setSelectedRowKeys] = useState<
    CityWithProjectDataResponse["cityId"][]
  >([]);
  const [singleRowSelected, setSingleRowSelected] = useState<string | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const selectedCityIds = useMemo(() => {
    return singleRowSelected ? [singleRowSelected] : selectedRowKeys;
  }, [selectedRowKeys, singleRowSelected]);

  if (isLoading || isLoadingOrganizationData) {
    return <ProgressLoader />;
  }

  return (
    <Box className="pt-16 pb-16  w-[1090px] mx-auto px-4">
      <Link href={`/${lng}`} _hover={{ textDecoration: "none" }}>
        <Box
          display="flex"
          alignItems="center"
          gap="8px"
          color="content.tertiary"
        >
          <Text
            textTransform="capitalize"
            fontFamily="heading"
            fontSize="body.lg"
            fontWeight="normal"
          >
            {t("go-back")}
          </Text>
        </Box>
      </Link>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Heading
          fontSize="headline.lg"
          fontWeight="semibold"
          color="content.primary"
          mb={12}
          mt={2}
          className="w-full"
        >
          {t("cities-heading")}
        </Heading>
        {selectedRowKeys.length > 0 && (
          <Box
            flex={1}
            display="flex"
            w="full"
            alignItems="center"
            gap={2}
            justifyContent="space-between"
          >
            <Text>
              {t("selected-cities", {
                count: selectedRowKeys.length,
              })}
            </Text>
            <Button
              onClick={() => {
                setIsModalOpen(true);
              }}
              variant="outline"
              h="48px"
              minWidth="120px"
              mt="auto"
            >
              {t("move")}
            </Button>
          </Box>
        )}
      </Box>
      <Box>
        {isLoading && <ProgressLoader />}
        {!isLoading && (data?.length === 0 || !data) && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("no-data")}
          </Text>
        )}
        {data && data.length > 0 && (
          <DataTable
            data={transformedCitiesData}
            searchable
            pagination
            itemsPerPage={20}
            title={t("manage-cities-heading")}
            columns={[
              { header: t("city"), accessor: "name" },
              {
                header: t("country"),
                accessor: "country",
              },
              { header: t("organization"), accessor: null },
              { header: t("email"), accessor: null },
              { header: "", accessor: null },
            ]}
            selectable
            selectKey="cityId"
            selectedRowKeys={selectedRowKeys}
            onSelectRow={(
              selectedRows: CityWithProjectDataResponse[keyof CityWithProjectDataResponse][],
            ) => {
              setSelectedRowKeys(
                selectedRows as CityWithProjectDataResponse["cityId"][],
              );
            }}
            renderRow={(item, idx) => (
              <Table.Row key={idx}>
                <Table.Cell>{item.name}</Table.Cell>
                <Table.Cell>{item.country}</Table.Cell>
                <Table.Cell>{item?.orgName ?? t("n-a")}</Table.Cell>
                <Table.Cell>{item?.orgEmail ?? t("n-a")}</Table.Cell>
                <Table.Cell>
                  <MenuRoot>
                    <MenuTrigger>
                      <IconButton
                        data-testid="activity-more-icon"
                        aria-label="more-icon"
                        variant="ghost"
                        color="content.tertiary"
                      >
                        <Icon as={MdMoreVert} size="lg" />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent
                      w="auto"
                      borderRadius="8px"
                      shadow="2dp"
                      px="0"
                    >
                      <MenuItem
                        value={t("move-to")}
                        valueText={t("move-to")}
                        p="16px"
                        display="flex"
                        alignItems="center"
                        gap="16px"
                        _hover={{
                          bg: "content.link",
                          cursor: "pointer",
                        }}
                        className="group"
                        onClick={() => {
                          setSingleRowSelected(item?.cityId);
                          setIsModalOpen(true);
                        }}
                      >
                        <Icon
                          className="group-hover:text-white"
                          color="interactive.control"
                          as={MdOutlineGroup}
                          h="24px"
                          w="24px"
                        />
                        <Text
                          className="group-hover:text-white"
                          color="content.primary"
                        >
                          {t("move-to")}
                        </Text>
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Table.Cell>
              </Table.Row>
            )}
          />
        )}
      </Box>
      <MoveCityModal
        t={t}
        isOpen={isModalOpen}
        organizationData={organizationData}
        onOpenChange={setIsModalOpen}
        selectedCityIds={selectedCityIds}
        closeFunction={() => {
          setIsModalOpen(false);
          setSingleRowSelected(null);
        }}
        clearSelections={() => {
          setSelectedRowKeys([]);
          setSingleRowSelected(null);
        }}
      />
    </Box>
  );
};

export default CitiesPage;
