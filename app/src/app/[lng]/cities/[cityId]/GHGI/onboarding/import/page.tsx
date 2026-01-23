"use client";

import { useTranslation } from "@/i18n/client";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import React, { use, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast, UseInfoToast, UseSuccessToast } from "@/hooks/Toasts";
import UploadFileStep from "@/components/steps/GHGI/import/upload-file-step";
import ValidationResultsStep from "@/components/steps/GHGI/import/validation-results-step";
import MappingColumnsStep from "@/components/steps/GHGI/import/mapping-columns-step";
import ReviewConfirmStep from "@/components/steps/GHGI/import/review-confirm-step";
import DataLossWarningModal from "@/components/Modals/data-loss-warning-modal";
import { api } from "@/services/api";
import { TFunction } from "i18next";

// Import button component for step 3
function ImportButton({
  cityId,
  inventoryId,
  importedFileId,
  onImport,
  t,
}: {
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  onImport: () => void;
  t: TFunction;
}) {
  const [approveImport, { isLoading: isImporting }] =
    api.useApproveImportMutation();

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const makeSuccessToast = (title: string, description?: string) => {
    const { showSuccessToast } = UseSuccessToast({ description, title });
    showSuccessToast();
  };

  const handleImport = async () => {
    if (!importedFileId) return;

    try {
      await approveImport({
        cityId,
        inventoryId,
        importedFileId,
      }).unwrap();

      makeSuccessToast("Import completed", "Your inventory data has been imported successfully.");
      onImport();
    } catch (error: any) {
      makeErrorToast(
        "Import failed",
        error?.data?.message || error?.message || "Failed to import data",
      );
    }
  };

  return (
    <Button
      w="auto"
      gap="8px"
      py="16px"
      px="24px"
      onClick={handleImport}
      h="64px"
      loading={isImporting}
      disabled={isImporting}
    >
      <Text
        fontFamily="button.md"
        fontWeight="600"
        letterSpacing="wider"
      >
        {t("import-inventory")}
      </Text>
      <MdArrowForward height="24px" width="24px" />
    </Button>
  );
}

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

  const makeInfoToast = (title: string, description?: string) => {
    const { showInfoToast } = UseInfoToast({ description, title });
    showInfoToast();
  };

  const [uploadFile, { isLoading: isUploadingFile }] =
    api.useUploadInventoryFileMutation();

  const handleFileUpload = async (file: File) => {
    if (!inventoryId) {
      makeErrorToast("Error", "Inventory ID is required");
      return;
    }

    // Show info toast when upload starts
    makeInfoToast(
      t("upload-started"),
      t("upload-started-description", { fileName: file.name }),
    );

    try {
      const result = await uploadFile({
        cityId,
        inventoryId,
        file,
      }).unwrap();

      setUploadedFile(file);
      setImportedFileId(result.id);
      
      // Small delay for smooth transition
      setTimeout(() => {
        goToNextStep();
      }, 150);
    } catch (error: any) {
      makeErrorToast(
        "Upload failed",
        error?.data?.message || error?.message || "Failed to upload file",
      );
    }
  };

  const handleContinue = () => {
    if (activeStep < steps.length - 1) {
      // Small delay for smooth transition
      setTimeout(() => {
        goToNextStep();
      }, 80);
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
          position="relative"
          minH="400px"
        >
          <Box w="full" position="relative" minH="400px" overflow="hidden">
            <AnimatePresence mode="wait">
              {activeStep === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <UploadFileStep
                    t={t}
                    uploadedFile={uploadedFile}
                    onFileUpload={handleFileUpload}
                    onRemoveFile={handleRemoveFile}
                    isUploading={isUploadingFile}
                  />
                </motion.div>
              )}
              {activeStep === 1 && importedFileId && inventoryId && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <ValidationResultsStep
                    t={t}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    importedFileId={importedFileId}
                    onContinue={handleContinue}
                  />
                </motion.div>
              )}
              {activeStep === 2 && importedFileId && inventoryId && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <MappingColumnsStep
                    t={t}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    importedFileId={importedFileId}
                    onContinue={handleContinue}
                  />
                </motion.div>
              )}
              {activeStep === 3 && importedFileId && inventoryId && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <ReviewConfirmStep
                    t={t}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    importedFileId={importedFileId}
                    onImport={() => {
                      // This is no longer used but kept for interface compatibility
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Box>
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
              {activeStep === 3 && importedFileId && inventoryId && (
                <ImportButton
                  cityId={cityId}
                  inventoryId={inventoryId}
                  importedFileId={importedFileId}
                  onImport={() => {
                    router.push(`/${lng}/cities/${cityId}/GHGI`);
                  }}
                  t={t}
                />
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
