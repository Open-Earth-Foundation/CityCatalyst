"use client";

import { Box, Tabs, Text } from "@chakra-ui/react";
import { FC } from "react";
import { UserAttributes } from "@/models/User";
import { TFunction } from "i18next";
import AccountDetailsTabPanel from "./AccountDetailsTabPanel";
import ManageUsersTabPanel from "./ManageUsersTabPanel";
import ManageCitiesTabPanel from "./ManageCitiesTabPanel";

interface MyProfileTabProps {
  t: TFunction;
  userInfo: UserAttributes | any;
  lng: string;
}

export const MyProfileTab: FC<MyProfileTabProps> = ({ t, lng, userInfo }) => {
  return (
    <Tabs.Content value="my-profile">
      <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
        <Box>
          <Text
            color="content.primary"
            fontWeight="bold"
            lineHeight="32"
            fontSize="headline.sm"
            fontFamily="heading"
            fontStyle="normal"
          >
            {t("my-profile")}
          </Text>
          <Text
            color="content.tertiary"
            fontWeight="normal"
            lineHeight="24"
            fontSize="body.lg"
            letterSpacing="wide"
            marginTop="8px"
          >
            {t("my-profile-sub-title")}
          </Text>
        </Box>
        <Box>
          <Tabs.Root
            display="flex"
            flexDirection="row"
            variant="subtle"
            gap="36px"
            defaultValue="account-details"
          >
            <Tabs.List display="flex" flexDirection="column" gap="12px">
              <Tabs.Trigger
                value="account-details"
                style={{
                  width: "223px",
                  justifyContent: "left",
                  height: "52px",
                  letterSpacing: "wide",
                  color: "content.secondary",
                  lineHeight: "20px",
                  fontStyle: "normal",
                  fontSize: "label.lg",
                  fontWeight: "medium",
                  fontFamily: "heading",
                }}
                _selected={{
                  color: "content.link",
                  fontSize: "label.lg",
                  fontWeight: "medium",
                  backgroundColor: "background.neutral",
                  borderRadius: "8px",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "content.link",
                }}
              >
                {t("account-details")}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="manage-users"
                style={{
                  width: "223px",
                  justifyContent: "left",
                  height: "52px",
                  letterSpacing: "wide",
                  color: "content.secondary",
                  lineHeight: "20px",
                  fontStyle: "normal",
                  fontSize: "label.lg",
                  fontWeight: "medium",
                  fontFamily: "heading",
                }}
                _selected={{
                  color: "content.link",
                  fontSize: "label.lg",
                  fontWeight: "medium",
                  backgroundColor: "background.neutral",
                  borderRadius: "8px",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "content.link",
                }}
              >
                {t("users")}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="manage-cities"
                style={{
                  width: "223px",
                  justifyContent: "left",
                  height: "52px",
                  letterSpacing: "wide",
                  color: "content.secondary",
                  lineHeight: "20px",
                  fontStyle: "normal",
                  fontSize: "label.lg",
                  fontWeight: "medium",
                  fontFamily: "heading",
                }}
                _selected={{
                  color: "content.link",
                  fontSize: "label.lg",
                  fontWeight: "medium",
                  backgroundColor: "background.neutral",
                  borderRadius: "8px",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "content.link",
                }}
              >
                {t("city")}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content
              value="account-details"
              display="flex"
              flexDirection="column"
              gap="36px"
              borderRadius="8px"
            >
              <Box>
                <Text
                  color="content.primary"
                  fontWeight="semibold"
                  lineHeight="24"
                  fontSize="title.md"
                  fontFamily="heading"
                  fontStyle="normal"
                >
                  {t("account-details")}
                </Text>
                <Text
                  color="content.tertiary"
                  fontWeight="normal"
                  lineHeight="24"
                  fontSize="body.lg"
                  letterSpacing="wide"
                  marginTop="8px"
                >
                  {t("my-profile-sub-title")}
                </Text>
              </Box>
              <AccountDetailsTabPanel t={t} userInfo={userInfo} />
            </Tabs.Content>
            <Tabs.Content
              value="manage-users"
              width="full"
              padding="24px"
              display="flex"
              flexDirection="column"
              gap="24px"
            >
              <ManageUsersTabPanel lng={lng} />
            </Tabs.Content>
            <Tabs.Content
              value="manage-cities"
              padding="24px"
              display="flex"
              flexDirection="column"
              gap="24px"
            >
              <ManageCitiesTabPanel t={t} />
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      </Box>
    </Tabs.Content>
  );
};
