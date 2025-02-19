import React, { FC, useEffect, useState } from "react";

import {
  Box,
  Center,
  ProgressCircle,
  HStack,
  Input,
  Select,
  Icon,
  createListCollection,
} from "@chakra-ui/react";
import { api } from "@/services/api";
import { GetUserCityInvitesResponse } from "@/util/types";
import ManageUsersTable from "./ManageUsersTable";
import { MdSearch } from "react-icons/md";
import { TitleMedium } from "@/components/Texts/Title";
import { AddCollaboratorButtonSmall } from "./AddCollaboratorButtonSmall";
import { useTranslation } from "@/i18n/client";
import { InputGroup } from "@/components/ui/input-group";
import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";

interface ManageUsersProps {
  lng: string;
}

const ManageUsersTabPanel: FC<ManageUsersProps> = ({ lng }) => {
  const { t } = useTranslation(lng, "settings");
  const { data: cityInvites, isLoading: isCityInvitesLoading } =
    api.useGetCityInvitesQuery();
  const [filterTerm, setFilterTerm] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const [filteredInvites, setFilteredInvites] = useState<
    Array<GetUserCityInvitesResponse>
  >([]);

  const roleCollection = createListCollection({
    items: [
      { label: t("all"), value: "all" },
      { label: t("admin"), value: "admin" },
      { label: t("contributor"), value: "contributor" },
    ],
  });

  useEffect(() => {
    if (cityInvites) {
      const result = cityInvites.filter((invite: any) => {
        const matchesSearchTerm =
          !filterTerm ||
          invite.user?.name
            .toLocaleLowerCase()
            .includes(filterTerm.toLocaleLowerCase()) ||
          invite.user?.email
            .toLocaleLowerCase()
            .includes(filterTerm.toLocaleLowerCase());
        const matchesRole =
          filterRole === "all" ||
          invite.user?.role.toLocaleLowerCase() ===
            filterRole.toLocaleLowerCase();
        return matchesSearchTerm && matchesRole;
      });
      setFilteredInvites(result);
    } else {
      setFilteredInvites([]);
    }
  }, [filterRole, filterTerm, cityInvites]);

  return (
    <>
      <HStack alignItems={"space-between"} justifyContent={"space-between"}>
        <TitleMedium>{t("manage-users")}</TitleMedium>
        <AddCollaboratorButtonSmall lng={lng} />
      </HStack>
      {cityInvites ? (
        <>
          <Box display="flex" justifyContent="space-between">
            <Box display="flex" gap="24px">
              <InputGroup
                w="365px"
                height="48px"
                shadow="1dp"
                alignItems="center"
                display="flex"
                borderRadius="4px"
                borderWidth="1px"
                borderStyle="solid"
                borderColor="border.neutral"
                startElement={
                  <Icon
                    as={MdSearch}
                    color="content.tertiary"
                    display="flex"
                    pointerEvents="none"
                    alignItems="center"
                    size="md"
                  />
                }
              >
                <Input
                  type="search"
                  fontSize="body.md"
                  fontFamily="heading"
                  letterSpacing="wide"
                  color="content.tertiary"
                  placeholder={t("search-filter-placeholder")}
                  border="none"
                  h="100%"
                  onChange={(e) => setFilterTerm(e.target.value)}
                />
              </InputGroup>
              <SelectRoot
                collection={roleCollection}
                h="48px"
                padding={0}
                w="150px"
                borderWidth="1px"
                borderStyle="solid"
                borderColor="border.neutral"
                onValueChange={(e) => setFilterRole(e.value[0])}
              >
                <SelectTrigger display="flex" height="full">
                  <SelectValueText placeContent="Select User Type" />
                </SelectTrigger>
                <SelectContent>
                  {roleCollection.items.map((item) => (
                    <SelectItem item={item} key={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </Box>
          </Box>
          <ManageUsersTable cityInvites={filteredInvites} t={t} />
        </>
      ) : (
        <Center>
          <ProgressCircle.Root value={null}>
            <ProgressCircle.Circle>
              <ProgressCircle.Track />
              <ProgressCircle.Range />
            </ProgressCircle.Circle>
            <ProgressCircle.ValueText />
          </ProgressCircle.Root>
        </Center>
      )}
    </>
  );
};

export default ManageUsersTabPanel;
