import {
  Box,
  createListCollection,
  HStack,
  Icon,
  SelectIndicatorGroup,
  Spinner,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import { FileUploadRoot } from "@/components/ui/file-upload";
import { IoMdInformationCircleOutline } from "react-icons/io";
import React, { useEffect, useMemo } from "react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  useGetOrganizationQuery,
  useGetThemesQuery,
  useGetUserAccessStatusQuery,
  useSetOrgWhiteLabelMutation,
} from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { useTheme } from "next-themes";
import { useLogo } from "@/hooks/logo-provider/use-logo-provider";
import ManagePasswordTabContent from "@/components/Tabs/MyProfileTab/ManagePasswordTabContent";

const TeamsTab = ({ t }: { t: TFunction }) => {
  return (
    <>
      <Text>
        {t("teams")}
      </Text>
    </>
  );
};

export default TeamsTab;
