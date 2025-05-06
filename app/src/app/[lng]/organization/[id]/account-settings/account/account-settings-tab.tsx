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
import LogoUploadCard from "./logo-file-upload";
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

const AccountSettingsTab = ({ t }: { t: TFunction }) => {
  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("account-brand-updated"),
    duration: 1200,
  });

  const KeyColorMapping = {
    blue_theme: "#001EA7",
    light_brown_theme: "#B0901C",
    dark_orange_theme: "#B0661C",
    green_theme: "#7FB01C",
    light_blue_theme: "#1CAEB0",
    violet_theme: "#7F1CB0",
  };

  type themeType = keyof typeof KeyColorMapping;

  const { data: themeOptions, isLoading: isThemeOptionsLoading } =
    useGetThemesQuery({});

  const options = useMemo(() => {
    return createListCollection({
      items: themeOptions
        ? themeOptions?.map((theme) => ({
            value: theme.themeId,
            key: theme.themeKey,
            label: t(theme.themeKey),
            color: KeyColorMapping[theme.themeKey as themeType],
          }))
        : [],
    });
  }, [themeOptions]);

  const [selectedTheme, setSelectedTheme] =
    React.useState<string>("blue_theme");

  const [file, setFile] = React.useState<File | null>(null);
  const [clearImage, setClearImage] = React.useState(false);
  const { setTheme } = useTheme();
  const { setLogoUrl } = useLogo();

  const { data: userAccessStatus, isLoading } = useGetUserAccessStatusQuery({});

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(userAccessStatus?.organizationId as string, {
      skip: !userAccessStatus?.organizationId,
    });

  const [setWhiteLabel, { isLoading: isSettingWhiteLabel }] =
    useSetOrgWhiteLabelMutation();

  const blueTheme = useMemo(() => {
    return themeOptions?.find((theme) => theme.themeKey === "blue_theme");
  }, [themeOptions]);

  const selectedThemeValue = useMemo(() => {
    return options?.items.find((item) => item.value === selectedTheme);
  }, [selectedTheme, options?.items]);

  useEffect(() => {
    if (organization) {
      setSelectedTheme((organization?.themeId as string) ?? blueTheme?.themeId);
    }
  }, [organization, blueTheme, setSelectedTheme]);

  const handleSubmit = async () => {
    if (!userAccessStatus?.organizationId) return;

    try {
      const response = await setWhiteLabel({
        organizationId: userAccessStatus.organizationId,
        whiteLabelData: {
          themeId: selectedTheme,
          logo: file ? file : undefined,
          clearLogoUrl: clearImage,
        },
      }).unwrap();

      console.log("response", response);

      setFile(null);
      setClearImage(false);
      setTheme(selectedThemeValue?.key as string);
      setLogoUrl(response?.logoUrl as string);
      showSuccessToast();
    } catch (err) {
      console.error("Failed to update white label settings:", err);
    }
  };

  const hasChanges = useMemo(() => {
    return (
      selectedTheme !== organization?.themeId || file !== null || clearImage
    );
  }, [selectedTheme, organization?.themeId, file, clearImage]);

  if (isLoading || isOrganizationLoading) return <ProgressLoader />;

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
                <LogoUploadCard
                  defaultUrl={clearImage ? undefined : organization?.logoUrl}
                  setFile={setFile}
                  clearImage={() => {
                    setClearImage(true);
                    setFile(null);
                  }}
                />
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
                    <Box h={5} w={5} bg={selectedThemeValue?.color} />
                    <SelectValueText
                      color="content.tertiary"
                      fontWeight="medium"
                      placeholder={t("select-theme")}
                    />
                  </HStack>
                </SelectTrigger>
                <SelectIndicatorGroup>
                  {isThemeOptionsLoading && (
                    <Spinner
                      size="xs"
                      ml={-10}
                      borderWidth="1.5px"
                      color="content.tertiary"
                    />
                  )}
                </SelectIndicatorGroup>
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
              <Button
                onClick={handleSubmit}
                h={16}
                disabled={!hasChanges}
                variant="solid"
                loading={isSettingWhiteLabel}
              >
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
