"use client";

import {
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";
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
    <TabPanel>
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
          <Tabs
            display="flex"
            flexDirection="row"
            variant="soft-rounded"
            gap="36px"
          >
            <TabList display="flex" flexDirection="column" gap="12px">
              <Tab
                sx={{
                  w: "223px",
                  justifyContent: "left",
                  h: "52px",
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
              </Tab>
              <Tab
                sx={{
                  w: "223px",
                  justifyContent: "left",
                  h: "52px",
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
              </Tab>
              <Tab
                sx={{
                  w: "223px",
                  justifyContent: "left",
                  h: "52px",
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
              </Tab>
            </TabList>

            <TabPanels backgroundColor="background.default">
              <TabPanel
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
              </TabPanel>
              <TabPanel
                width="full"
                padding="24px"
                display="flex"
                flexDirection="column"
                gap="24px"
              >
                <ManageUsersTabPanel lng={lng} />
              </TabPanel>
              <TabPanel
                padding="24px"
                display="flex"
                flexDirection="column"
                gap="24px"
              >
                <ManageCitiesTabPanel t={t} />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </Box>
    </TabPanel>
  );
};
