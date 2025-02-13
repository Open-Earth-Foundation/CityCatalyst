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
import { TFunction } from "i18next";

interface ManagePasswordProps {
  t: TFunction;
}

const ManagePasswordTabContent: FC<ManagePasswordProps> = ({ t }) => {
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
        <TitleMedium>{t("manage-password")}</TitleMedium>
      </HStack>
      <Box></Box>
    </>
  );
};

export default ManagePasswordTabContent;
