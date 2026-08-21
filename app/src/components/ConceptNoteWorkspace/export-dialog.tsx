"use client";

import { Box, Flex, Grid, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuCheck,
  LuCircleAlert,
  LuDownload,
  LuFileText,
  LuInfo,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";

interface ExportDialogProps {
  hasUploadedEvidence: boolean;
  lng: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ExportDialog({
  hasUploadedEvidence,
  lng,
  onOpenChange,
  open,
}: ExportDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      size="lg"
    >
      <DialogContent
        maxW="640px"
        maxH="calc(100dvh - 32px)"
        my={4}
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader
          display="block"
          borderBottom="1px solid"
          borderColor="border.neutral"
          px={6}
          py={5}
          pe={12}
        >
          <DialogTitle
            fontFamily="heading"
            fontSize="title.lg"
            color="content.primary"
          >
            {t("export-concept-note")}
          </DialogTitle>
          <Text mt={1} fontSize="body.sm" color="content.tertiary">
            {t("export-description")}
          </Text>
        </DialogHeader>
        <DialogCloseTrigger aria-label={t("close")} />

        <DialogBody minH={0} overflowY="auto" px={6} py={5}>
          <VStack align="stretch" gap={5}>
            <Box>
              <Text
                mb={3}
                fontFamily="heading"
                fontSize="overline"
                fontWeight="semibold"
                letterSpacing="widest"
                color="content.tertiary"
                textTransform="uppercase"
              >
                {t("preflight-checks")}
              </Text>
              <VStack align="stretch" gap={2}>
                <HStack
                  gap={3}
                  border="1px solid"
                  borderColor={
                    hasUploadedEvidence
                      ? "sentiment.positiveDefault"
                      : "sentiment.warningDefault"
                  }
                  borderRadius="rounded"
                  bg={
                    hasUploadedEvidence
                      ? "sentiment.positiveOverlay"
                      : "sentiment.warningOverlay"
                  }
                  p={3}
                >
                  <Icon
                    as={hasUploadedEvidence ? LuCheck : LuCircleAlert}
                    color={
                      hasUploadedEvidence
                        ? "sentiment.positiveDefault"
                        : "sentiment.warningDefault"
                    }
                  />
                  <Box flex={1}>
                    <Text
                      fontSize="body.sm"
                      fontWeight="semibold"
                      color="content.primary"
                    >
                      {hasUploadedEvidence
                        ? t("source-context-ready")
                        : t("source-context-recommended")}
                    </Text>
                    <Text fontSize="label.sm" color="content.secondary">
                      {hasUploadedEvidence
                        ? t("source-context-ready-export")
                        : t("source-context-recommended-export")}
                    </Text>
                  </Box>
                </HStack>
                <HStack
                  gap={3}
                  border="1px solid"
                  borderColor="sentiment.warningDefault"
                  borderRadius="rounded"
                  bg="sentiment.warningOverlay"
                  p={3}
                >
                  <Icon as={LuCircleAlert} color="sentiment.warningDefault" />
                  <Box flex={1}>
                    <Text
                      fontSize="body.sm"
                      fontWeight="semibold"
                      color="content.primary"
                    >
                      {t("draft-preflight-warning")}
                    </Text>
                    <Text fontSize="label.sm" color="content.secondary">
                      {t("draft-preflight-warning-description")}
                    </Text>
                  </Box>
                </HStack>
              </VStack>
            </Box>

            <Box>
              <Text
                mb={3}
                fontFamily="heading"
                fontSize="overline"
                fontWeight="semibold"
                letterSpacing="widest"
                color="content.tertiary"
                textTransform="uppercase"
              >
                {t("export-formats")}
              </Text>
              <Grid
                gap={3}
                gridTemplateColumns={{
                  base: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                }}
              >
                {[
                  { format: "DOCX", description: t("docx-description") },
                  { format: "PDF", description: t("pdf-description") },
                ].map((item) => (
                  <VStack
                    key={item.format}
                    align="stretch"
                    gap={3}
                    border="1px solid"
                    borderColor="border.neutral"
                    borderRadius="rounded"
                    bg="background.alternativeLight"
                    p={4}
                  >
                    <Flex align="center" gap={3}>
                      <Flex
                        boxSize="36px"
                        align="center"
                        justify="center"
                        borderRadius="rounded"
                        bg="base.light"
                        color="content.link"
                      >
                        <Icon as={LuFileText} />
                      </Flex>
                      <Box>
                        <Text
                          fontFamily="heading"
                          fontSize="body.sm"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {item.format}
                        </Text>
                        <Text fontSize="label.sm" color="content.tertiary">
                          {item.description}
                        </Text>
                      </Box>
                    </Flex>
                    <Button disabled size="sm" variant="outline">
                      <Icon as={LuDownload} />
                      {t("export-format", { format: item.format })}
                    </Button>
                  </VStack>
                ))}
              </Grid>
            </Box>

            <HStack
              align="start"
              gap={2}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="background.neutral"
              p={3}
            >
              <Icon as={LuInfo} mt={0.5} color="content.link" />
              <Text
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {t("export-backend-note")}
              </Text>
            </HStack>
          </VStack>
        </DialogBody>

        <DialogFooter
          gap={3}
          borderTop="1px solid"
          borderColor="border.neutral"
          px={6}
          py={4}
        >
          <Button
            variant="ghost"
            color="content.link"
            _hover={{ color: "content.link" }}
            onClick={() => onOpenChange(false)}
          >
            {t("go-back")}
          </Button>
          <Button disabled variant="solid">
            {t("export-anyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
