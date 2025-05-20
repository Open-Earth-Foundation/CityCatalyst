"use client";

import { useTranslation } from "@/i18n/client";
import { Box, Heading, HStack, Tabs, Text } from "@chakra-ui/react";
import Link from "next/link";
import AccountSettingsTab from "./account";
import TeamSettings from "./team";
import ProjectSettings from "./project/index";

// TODO create tabs component with recipe
const AccountSettingsPage = ({
  params: { lng, id },
}: {
  params: { lng: string; id: string };
}) => {
  const { t } = useTranslation(lng, "settings");

  return (
    <Box className="pt-16 pb-16  w-[1090px] mx-auto px-4">
      <Link href={`/${lng}`}>
        <Box
          display="flex"
          alignItems="center"
          gap="8px"
          color="content.tertiary"
        >
          <Text
            fontFamily="heading"
            color="content.tertiary"
            fontSize="body.lg"
            fontWeight="normal"
          >
            {t("go-back")}
          </Text>
        </Box>
      </Link>
      <Box w="full">
        <Text
          color="content.primary"
          fontWeight="bold"
          lineHeight="40"
          mt={2}
          fontSize="headline.lg"
          fontFamily="body"
        >
          {t("account-settings")}
        </Text>
        <Box marginTop="48px" borderBottomColor={"border.overlay"}>
          <Tabs.Root defaultValue="account" variant="enclosed">
            <Tabs.List
              p={0}
              w="full"
              backgroundColor="background.backgroundLight"
            >
              <Tabs.Trigger
                value="account"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                  backgroundColor: "background.backgroundLight",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("account")}
                </Text>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="team"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                  backgroundColor: "background.backgroundLight",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("team")}
                </Text>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="project"
                _selected={{
                  borderColor: "content.link",
                  borderBottomWidth: "2px",
                  boxShadow: "none",
                  fontWeight: "bold",
                  borderRadius: "0",
                  color: "content.link",
                  backgroundColor: "background.backgroundLight",
                }}
              >
                <Text fontSize="title.md" fontStyle="normal" lineHeight="24px">
                  {t("projects")}
                </Text>
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="account">
              <Box
                w="full"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box w="full">
                  <Heading
                    fontSize="headline.sm"
                    mb={2}
                    fontWeight="semibold"
                    lineHeight="32px"
                    fontStyle="normal"
                    textTransform="capitalize"
                    color="content.secondary"
                    mt={12}
                  >
                    {t("account")}
                  </Heading>
                  <AccountSettingsTab t={t} />
                </Box>
              </Box>
            </Tabs.Content>
            <Tabs.Content value="team">
              <TeamSettings lng={lng} id={id} />
            </Tabs.Content>
            <Tabs.Content value="project">
              <ProjectSettings lng={lng} id={id} />
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      </Box>
    </Box>
  );
};

export default AccountSettingsPage;
