"use client";

import DataTable from "@/components/ui/data-table";
import { Icon, Table } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { MdNavigateNext } from "react-icons/md";
import { Button } from "@/components/ui/button";

interface City {
  cityId: string;
  name: string;
  country: string;
}

interface CitiesTableProps {
  cities: City[];
  lng: string;
  t: (key: string) => string;
}

export default function CitiesTable({ cities, lng, t }: CitiesTableProps) {
  const router = useRouter();

  return (
    <DataTable
      data={cities}
      searchable
      pagination
      itemsPerPage={20}
      columns={[
        { header: t("city-name"), accessor: "name" },
        {
          header: t("country-name"),
          accessor: "country",
        },
        { header: t("status"), accessor: null },
        { header: "", accessor: null },
      ]}
      selectKey="cityId"
      renderRow={(item, idx) => (
        <Table.Row key={idx}>
          <Table.Cell>{item.name}</Table.Cell>
          <Table.Cell>{item.country}</Table.Cell>
          <Table.Cell>{t("active")}</Table.Cell>
          <Table.Cell textAlign="end">
            <Button
              variant="ghost"
              onClick={() => {
                router.push(`/${lng}/cities/${item.cityId}`);
              }}
            >
              <Icon
                as={MdNavigateNext}
                boxSize={6}
                color="interactive.control"
              />
            </Button>
          </Table.Cell>
        </Table.Row>
      )}
    />
  );
}
