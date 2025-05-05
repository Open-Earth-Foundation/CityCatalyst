import {
  Box,
  createListCollection,
  HStack,
  Icon,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { Field } from "@/components/ui/field";
import LogoUploadCard from "@/app/[lng]/account-settings/account/logo-file-upload";
import { FileUploadRoot } from "@/components/ui/file-upload";
import { IoMdInformationCircleOutline } from "react-icons/io";
import React from "react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const AccountSettingsTab = ({ t }: { t: TFunction }) => {
  const KeyColorMapping = {
    blue_theme: "#001EA7",
    light_brown_theme: "#B0901C",
    dark_orange_theme: "#B0661C",
    green_theme: "#7FB01C",
    light_blue_theme: "#1CAEB0",
    violet_theme: "#7F1CB0",
  };

  type themeType = keyof typeof KeyColorMapping;

  const options = createListCollection({
    items: [
      {
        value: "blue_theme",
        label: t("blue_theme"),
        color: "#001EA7",
      },
      {
        value: "light_brown_theme",
        label: t("light_brown_theme"),
        color: "#B0901C",
      },
      {
        value: "dark_orange_theme",
        label: t("dark_orange_theme"),
        color: "#B0661C",
      },
      {
        value: "green_theme",
        label: t("green_theme"),
        color: "#7FB01C",
      },
      {
        value: "light_blue_theme",
        label: t("light_blue_theme"),
        color: "#1CAEB0",
      },
      {
        value: "violet_theme",
        label: t("violet_theme"),
        color: "#7F1CB0",
      },
    ],
  });

  const [selectedTheme, setSelectedTheme] =
    React.useState<string>("blue_theme");

  return (
    <Tabs.Root
      display="flex"
      w="full"
      flexDirection="row"
      variant="subtle"
      gap="36px"
      defaultValue="brand-settings"
    >
      <Tabs.List display="flex" flexDirection="column" gap="12px">
        <Tabs.Trigger
          value="brand-settings"
          fontFamily="heading"
          justifyContent={"left"}
          letterSpacing={"wide"}
          color="content.secondary"
          lineHeight="20px"
          fontStyle="normal"
          fontSize="label.lg"
          height="52px"
          w={"223px"}
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
          {t("brand-settings")}
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content
        value="brand-settings"
        display="flex"
        padding={0}
        flexDirection="column"
        gap="36px"
        borderRadius="8px"
      >
        <Box bg="background.default" p={6} rounded={2} w="full">
          <Text
            color="content.primary"
            fontWeight="semibold"
            lineHeight="24"
            fontSize="title.md"
            fontFamily="heading"
            fontStyle="normal"
          >
            {t("brand-settings")}
          </Text>
          <Text
            color="content.tertiary"
            fontWeight="normal"
            lineHeight="24"
            fontSize="body.lg"
            letterSpacing="wide"
            marginTop="8px"
          >
            {t("brand-settings-description")}
          </Text>
          <Box mt={9}>
            <Field className="w-full" label={t("logo")}>
              <FileUploadRoot accept={{ "image/*": [] }} maxFiles={1}>
                <LogoUploadCard />
              </FileUploadRoot>
              <HStack>
                <Icon
                  color="content.tertiary"
                  as={IoMdInformationCircleOutline}
                />
                <Text color="content.tertiary" fontSize="body.sm">
                  {t("logo-recommendation")}
                </Text>
              </HStack>
            </Field>
            <Field mt={9} className="w-full" label={t("primary-color")}>
              <SelectRoot
                collection={options}
                value={[selectedTheme]}
                onValueChange={({ value }) => {
                  setSelectedTheme(value[0]);
                }}
                shadow="1dp"
                borderRadius="4px"
                border="inpu/tBox"
                fontSize="body.lg"
                h="full"
                w="full"
                _focus={{
                  borderWidth: "1px",
                  borderColor: "content.link",
                  shadow: "none",
                }}
              >
                <SelectTrigger
                  borderWidth="1px"
                  borderColor="border.neutral"
                  borderRadius="md"
                >
                  <HStack>
                    <Box
                      h={5}
                      w={5}
                      bg={KeyColorMapping[selectedTheme as themeType]}
                    />
                    <SelectValueText
                      color="content.tertiary"
                      fontWeight="medium"
                      placeholder={t("select-theme")}
                    />
                  </HStack>
                </SelectTrigger>
                <SelectContent>
                  {options?.items.map((item) => {
                    return (
                      <SelectItem key={item.value} item={item} gap={2}>
                        <HStack>
                          <Box h={5} w={5} bg={item.color} />
                          <Text
                            fontSize="body.lg"
                            color="content.primary"
                            fontWeight="normal"
                            lineHeight="24"
                            letterSpacing="wide"
                          >
                            {item.label}
                          </Text>
                        </HStack>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </SelectRoot>
              <HStack>
                <Icon
                  color="content.tertiary"
                  as={IoMdInformationCircleOutline}
                />
                <Text color="content.tertiary" fontSize="body.sm">
                  {t("primary-color-recommendation")}
                </Text>
              </HStack>
            </Field>
            <Box justifyContent="end" w="full" display="flex" mt={6}>
              <Button h={16} variant="solid">
                {t("save-changes")}
              </Button>
            </Box>
          </Box>
        </Box>
      </Tabs.Content>
    </Tabs.Root>
  );
};

export default AccountSettingsTab;
