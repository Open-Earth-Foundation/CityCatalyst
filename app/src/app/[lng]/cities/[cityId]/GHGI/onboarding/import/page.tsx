"use client";

import { useTranslation } from "@/i18n/client";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import React, { use, useState, useEffect, useRef } from "react";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast } from "@/hooks/Toasts";
import UploadFileStep from "@/components/steps/GHGI/import/upload-file-step";
import ValidationResultsStep from "@/components/steps/GHGI/import/validation-results-step";
import MappingColumnsStep from "@/components/steps/GHGI/import/mapping-columns-step";
import ReviewConfirmStep from "@/components/steps/GHGI/import/review-confirm-step";
import DataLossWarningModal from "@/components/Modals/data-loss-warning-modal";

export default function ImportPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const inventoryId = searchParams.get("inventory");

  const steps = [
    { title: t("upload-file-step") },
    { title: t("validation-results-step") },
    { title: t("mapping-columns-step") },
    { title: t("review-confirm-step") },
  ];

  const {
    value: activeStep,
    goToNextStep,
    goToPrevStep,
    setStep,
  } = useSteps({
    defaultStep: 0,
    count: steps.length,
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importedFileId, setImportedFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDataLossModal, setShowDataLossModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);

  // Check if there's unsaved progress
  const hasUnsavedProgress = uploadedFile !== null || importedFileId !== null;

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const handleFileUpload = async (file: File) => {
    if (!inventoryId) {
      makeErrorToast("Error", "Inventory ID is required");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/v1/city/${cityId}/inventory/${inventoryId}/import`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload file");
      }

      const result = await response.json();
      setUploadedFile(file);
      setImportedFileId(result.data.id);
      goToNextStep();
    } catch (error: any) {
      makeErrorToast("Upload failed", error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    if (activeStep < steps.length - 1) {
      goToNextStep();
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setImportedFileId(null);
    setStep(0);
  };

  // Handle beforeunload event (browser refresh/close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedProgress) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we still need to call preventDefault
        e.returnValue = "";
        return "";
      }
    };

    if (hasUnsavedProgress) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [hasUnsavedProgress]);

  // Handle route changes
  useEffect(() => {
    prevPathnameRef.current = pathname;
  }, [pathname]);

  // Handle navigation attempts (back button, router.push, etc.)
  const handleNavigation = (navigationFn: () => void) => {
    if (hasUnsavedProgress) {
      setPendingNavigation(() => navigationFn);
      setShowDataLossModal(true);
    } else {
      navigationFn();
    }
  };

  const handleConfirmLeave = () => {
    setShowDataLossModal(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const handleCancelLeave = () => {
    setShowDataLossModal(false);
    setPendingNavigation(null);
  };

  return (
    <>
      <Box pt={16} pb={16} maxW="full" mx="auto" w="1090px">
        <Button
          variant="ghost"
          onClick={() => {
            if (activeStep === 0) {
              handleNavigation(() => router.back());
            } else {
              goToPrevStep();
            }
          }}
          pl={0}
          color="content.link"
        >
          <Icon as={MdArrowBack} boxSize={6} />
          {t("go-back")}
        </Button>
        <Box
          display="flex"
          flexDirection={{ base: "column", md: "row" }}
          columnGap={{ md: "48px" }}
          rowGap={{ base: "48px", md: "0px" }}
          alignItems="flex-start"
          mt={{ base: 8, md: 16 }}
          mb={48}
          w={"1090px"}
          mx="auto"
        >
          {activeStep === 0 && (
            <UploadFileStep
              t={t}
              uploadedFile={uploadedFile}
              onFileUpload={handleFileUpload}
              onRemoveFile={handleRemoveFile}
              isUploading={isUploading}
            />
          )}
          {activeStep === 1 && importedFileId && inventoryId && (
            <ValidationResultsStep
              t={t}
              cityId={cityId}
              inventoryId={inventoryId}
              importedFileId={importedFileId}
              onContinue={handleContinue}
            />
          )}
          {activeStep === 2 && importedFileId && inventoryId && (
            <MappingColumnsStep
              t={t}
              cityId={cityId}
              inventoryId={inventoryId}
              importedFileId={importedFileId}
              onContinue={handleContinue}
            />
          )}
          {activeStep === 3 && importedFileId && inventoryId && (
            <ReviewConfirmStep
              t={t}
              cityId={cityId}
              inventoryId={inventoryId}
              importedFileId={importedFileId}
              onImport={() => {
                // Handle final import
                router.push(`/${lng}/cities/${cityId}/GHGI`);
              }}
            />
          )}
        </Box>
        <Box
          bg="white"
          w="full"
          position="fixed"
          bottom={0}
          left={0}
          pb={8}
          px={1}
          zIndex={9999}
          transition="all"
          data-import-bottom-bar
        >
          <Box w="full" display="flex" flexDir="column" gap="32px">
            <Box w="full">
              <Box w="full">
                <ProgressSteps steps={steps} currentStep={activeStep} />
              </Box>
            </Box>
            <Box w="full" display="flex" justifyContent="end" px="135px">
              {activeStep === 0 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleContinue}
                  h="64px"
                  disabled={!uploadedFile || !importedFileId}
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
              {activeStep === 1 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleContinue}
                  h="64px"
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
              {activeStep === 2 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleContinue}
                  h="64px"
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      <DataLossWarningModal
        isOpen={showDataLossModal}
        onOpenChange={setShowDataLossModal}
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
        t={t}
      />
    </>
  );
}
