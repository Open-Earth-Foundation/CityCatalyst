"use client";

import DataTable from "@/components/ui/data-table";
import { Link, Table } from "@chakra-ui/react";

interface City {
  cityId: string;
  name: string;
  country: string;
  region?: string;
}

interface CitiesTableProps {
  cities: City[];
  lng: string;
  t: (key: string) => string;
  organizationId: string;
  projectId: string;
}

export default function CitiesTable({
  cities,
  lng,
  t,
  organizationId,
  projectId,
}: CitiesTableProps) {
  return (
    <DataTable
      data={cities}
      searchable
      pagination
      itemsPerPage={20}
      columns={[
        { header: t("city-name"), accessor: "name" },
        { header: t("state-name"), accessor: "region" },
        { header: t("country-name"), accessor: "country" },
        { header: t("collaborators"), accessor: null },
      ]}
      selectKey="cityId"
      renderRow={(item, idx) => (
        <Table.Row key={idx} _hover={{ bg: "background.alternativeLight" }}>
          <Table.Cell>
            <Link
              href={`/${lng}/cities/${item.cityId}`}
              color="content.link"
              textDecoration="underline"
            >
              {item.name}
            </Link>
          </Table.Cell>
          <Table.Cell>{item.region}</Table.Cell>
          <Table.Cell>{item.country}</Table.Cell>
          <Table.Cell>
            <Link
              href={`/${lng}/organization/${organizationId}/account-settings?tab=team&project=${projectId}&city=${item.cityId}`}
              color="content.link"
              textDecoration="underline"
            >
              {t("view-full-list")}
            </Link>
          </Table.Cell>
        </Table.Row>
      )}
    />
  );
}
