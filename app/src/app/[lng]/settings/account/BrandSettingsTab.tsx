import {
  Box,
  createListCollection,
  HStack,
  Icon,
  SelectIndicatorGroup,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { IoMdInformationCircleOutline } from "react-icons/io";

import ProgressLoader from "@/components/ProgressLoader";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FileUploadRoot } from "@/components/ui/file-upload";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { trackEvent } from "@/lib/analytics";
import { api } from "@/services/api";
import { logger } from "@/services/logger";
import LogoUploadCard from "./logo-file-upload";

const KeyColorMapping = {
  blue_theme: "#001EA7",
  light_brown_theme: "#B0901C",
  dark_orange_theme: "#B0661C",
  green_theme: "#7FB01C",
  light_blue_theme: "#1CAEB0",
  violet_theme: "#7F1CB0",
};
type themeType = keyof typeof KeyColorMapping;

const BrandSettingsTab = ({ t }: { t: TFunction }) => {
  const [selectedTheme, setSelectedTheme] = useState<string>("blue_theme");

  const { data: themeOptions, isLoading: isThemeOptionsLoading } =
    api.useGetThemesQuery({});

  const { data: userAccessStatus, isLoading } = api.useGetUserAccessStatusQuery(
    {},
  );

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
  }, [themeOptions, t]);

  const { data: organization, isLoading: isOrganizationLoading } =
    api.useGetOrganizationQuery(userAccessStatus?.organizationId as string, {
      skip: !userAccessStatus?.organizationId,
    });

  const [file, setFile] = useState<File | null>(null);
  const [clearImage, setClearImage] = useState(false);
  const { setTheme } = useTheme();
  const { setOrganization } = useOrganizationContext();

  const [setWhiteLabel, { isLoading: isSettingWhiteLabel }] =
    api.useSetOrgWhiteLabelMutation();

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

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("account-brand-updated"),
    duration: 1200,
  });

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

      // Track white label customization
      trackEvent("white_label_customized", {
        organization_id: userAccessStatus?.organizationId,
      });

      setFile(null);
      setClearImage(false);
      setTheme(selectedThemeValue?.key as string);
      setOrganization({
        logoUrl: response?.logoUrl ?? null,
      });
      showSuccessToast();
    } catch (err) {
      logger.error({ err: err }, "Failed to update white label settings:");
      showErrorToast();
    }
  };

  const hasChanges = useMemo(() => {
    return (
      selectedTheme !== organization?.themeId || file !== null || clearImage
    );
  }, [selectedTheme, organization?.themeId, file, clearImage]);

  useEffect(() => {
    if (organization) {
      setSelectedTheme((organization?.themeId as string) ?? blueTheme?.themeId);
    }
  }, [organization, blueTheme, setSelectedTheme]);

  if (isLoading || isOrganizationLoading) return <ProgressLoader />;

  return (
    <Box backgroundColor="white" p={6} borderRadius="8px" boxShadow="shadow-lg">
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
        <Field w="full" label={t("logo")}>
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
            <Icon color="content.tertiary" as={IoMdInformationCircleOutline} />
            <Text color="content.tertiary" fontSize="body.sm">
              {t("logo-recommendation")}
            </Text>
          </HStack>
        </Field>
        <Field mt={9} w="full" label={t("primary-color")}>
          <SelectRoot
            collection={options}
            value={[selectedTheme]}
            onValueChange={({ value }) => {
              setSelectedTheme(value[0]);
            }}
            shadow="1dp"
            borderRadius="4px"
            border="inputBox"
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
              <HStack w="full">
                <Box h={5} w={5} bg={selectedThemeValue?.color} />
                <SelectValueText
                  color="content.tertiary"
                  fontWeight="medium"
                  placeholder={t("select-theme")}
                  w="full"
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
            <Icon color="content.tertiary" as={IoMdInformationCircleOutline} />
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
  );
};

export default BrandSettingsTab;
