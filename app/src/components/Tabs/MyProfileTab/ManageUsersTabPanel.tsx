import React, { FC, useEffect, useState } from "react";

import {
  Box,
  Button,
  Center,
  CircularProgress,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Text,
} from "@chakra-ui/react";
import { api } from "@/services/api";
import { TFunction } from "i18next";
import { GetUserCityInvitesResponse } from "@/util/types";
import ManageUsersTable from "./ManageUsersTable";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import { TitleMedium } from "@/components/Texts/Title";
import { AddCollaboratorButtonSmall } from "./AddCollaboratorButtonSmall";
import { useTranslation } from "@/i18n/client";

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
              >
                <InputLeftElement
                  h="100%"
                  display="flex"
                  paddingLeft="10px"
                  pointerEvents="none"
                  alignItems="center"
                >
                  <SearchIcon color="content.tertiary" />
                </InputLeftElement>
                <Input
                  type="tel"
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
              <Select
                h="48px"
                w="auto"
                borderWidth="1px"
                borderStyle="solid"
                borderColor="border.neutral"
                onChange={(e) => setFilterRole(e.target.value)}
              >
                <option value="all">{t("all")}</option>
                <option value="admin">{t("admin")}</option>
                <option value="contributor">{t("contributor")}</option>
              </Select>
            </Box>
            <Box display="flex" alignItems="center" gap="8px">
              <Text
                color="content.tertiary"
                fontSize="body.md"
                fontFamily="heading"
                fontWeight="normal"
                letterSpacing="wide"
              >
                1-{filteredInvites.length} of {filteredInvites.length}
              </Text>
              <Box display="flex" gap="8px">
                <Button variant="ghost" h="24px" w="24px">
                  <ChevronLeftIcon
                    h="24px"
                    w="24px"
                    color="background.overlay"
                  />
                </Button>
                <Button variant="ghost" h="24px" w="24px">
                  <ChevronRightIcon
                    h="24px"
                    w="24px"
                    color="content.secondary"
                  />
                </Button>
              </Box>
            </Box>
          </Box>
          <ManageUsersTable cityInvites={filteredInvites} t={t} />
        </>
      ) : (
        <Center>
          <CircularProgress isIndeterminate />
        </Center>
      )}
    </>
  );
};

export default ManageUsersTabPanel;
