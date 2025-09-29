import { toaster } from "@/components/ui/toaster";
import { api } from "@/services/api";
import {
  Box,
  Field,
  FieldRoot,
  Fieldset,
  Heading,
  NativeSelect,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { logger } from "@/services/logger";

interface BulkActionsTabContentProps {
  t: TFunction;
}
export interface BulkDownloadInputs {
  projectId: string;
}

const BulkDownloadTabContent: FC<BulkActionsTabContentProps> = ({ t }) => {
  // React hook form to manage form state
  const { register, handleSubmit, reset } = useForm<BulkDownloadInputs>();

  const { data: projectsList, isLoading: isProjectListLoading } =
    api.useGetUserProjectsQuery({});
  const [isDownloadLoading, setDownloadLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showToast = (
    title: string,
    description: string,
    status: string,
    duration: number | null,
  ) => {
    // Replace previous toast notifications
    if (duration == null) {
      toaster.dismiss();
    }

    toaster.create({
      description: t(description),
      type: status,
      duration: duration!,
    });
  };

  const onSubmit = async (data: BulkDownloadInputs) => {
    showToast("preparing-dataset", "wait-fetch-data", "info", null);
    setDownloadLoading(true);
    fetch(`/api/v0/projects/${data.projectId}/bulk-download`)
      .then(async (res) => {
        setDownloadLoading(false);
        if (!res.ok) {
          const response = await res.json();
          logger.error(
            { response, status: res.status, projectId: data.projectId },
            "Network response was not ok",
          );
          const message =
            response.message ??
            response.error?.error ??
            response.error?.message ??
            "";
          setErrorMessage(message);
          showToast("download-failed", "download-error", "error", null);
          return;
        } else {
          setErrorMessage("");
        }

        const contentDisposition = res.headers.get("Content-Disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          const filename = match ? match[1] : `${data.projectId}.csv`;
          return res.blob().then((blob) => {
            const downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = filename;

            downloadLink.click();
            showToast("download-complete", "downloading-data", "success", null);
            URL.revokeObjectURL(downloadLink.href);
            downloadLink.remove();
          });
        } else {
          logger.error(
            { headers: res.headers, projectId: data.projectId },
            "Content-Disposition missing in response headers",
          );
          showToast("download-failed", "download-error", "error", null);
        }
      })
      .catch((error) => {
        setDownloadLoading(false);
        logger.error(
          {
            err: error,
            projectId: data.projectId,
          },
          "Failed to download inventory",
        );
        showToast("download-failed", "download-error", "error", null);
      });
  };

  return (
    <Tabs.Content value="bulk-data-download" px="60px" py="24px">
      <Box>
        <Heading
          fontSize="title.md"
          mb={2}
          fontWeight="semibold"
          lineHeight="32px"
          fontStyle="normal"
          textTransform="initial"
          color="content.secondary"
        >
          {t("bulk-data-download")}
        </Heading>
        <Text color="content.tertiary" fontSize="body.lg">
          {t("bulk-data-download-caption")}
        </Text>
      </Box>
      <Box>
        <Fieldset.Root size="lg" maxW="full" py="36px">
          <Fieldset.Content display="flex" flexDir="column" gap="36px">
            <FieldRoot>
              <Field.Label
                fontFamily="heading"
                fontWeight="medium"
                fontSize="body.md"
                mb="4px"
              >
                {t("project")}
              </Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  h="56px"
                  boxShadow="1dp"
                  {...register("projectId", {
                    required: "A project is required",
                  })}
                >
                  {projectsList?.map((project) => (
                    <option value={project.projectId} key={project.projectId}>
                      {project.name}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </FieldRoot>
          </Fieldset.Content>

          <Text color="semantic.danger">{errorMessage}</Text>

          <Box
            display="flex"
            alignItems="center"
            mt="48px"
            w="full"
            gap="24px"
            justifyContent="right"
          >
            <Button
              alignSelf="flex-start"
              variant="outline"
              p="32px"
              onClick={() => reset()}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              alignSelf="flex-start"
              loading={isDownloadLoading}
              p="32px"
              onClick={handleSubmit(onSubmit)}
            >
              {t("download-csv")}
            </Button>
          </Box>
        </Fieldset.Root>
      </Box>
    </Tabs.Content>
  );
};

export default BulkDownloadTabContent;
