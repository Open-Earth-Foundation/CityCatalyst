"use client";
import { TFunction } from "i18next";
import React, { useState } from "react";

import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Badge, Box, HStack, Input, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { FiTrash2 } from "react-icons/fi";
import { Trans } from "react-i18next";
import { Field } from "@/components/ui/field";
import { useDeleteCityMutation } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

interface DeleteCityModalProps {
  cityId: string;
  countryName: string;
  cityName: string;
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  onOpenChange: (val: boolean) => void;
}

const DeleteCityModal = (props: DeleteCityModalProps) => {
  const { cityId, cityName, onClose, isOpen, onOpenChange, t } = props;

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("city-deleted"),
    duration: 1200,
  });

  const [cityToDelete, setCityToDelete] = useState("");
  const [deleteCity, { isLoading }] = useDeleteCityMutation();

  const [step, setStep] = useState(1);

  const nextFunction = () => {
    setStep(2);
  };

  const submitFunction = async () => {
    if (!(cityToDelete.trim() === cityName.trim())) {
      return;
    }

    const response = await deleteCity(cityId);

    if (response.data) {
      showSuccessToast();
      onClose();
      setStep(1);
    } else {
      showErrorToast();
    }
  };

  const closeFunction = () => {
    onClose();
    setStep(1);
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: { open: boolean }) => {
        onOpenChange(e.open);
        if (!e.open) {
          setCityToDelete("");
          closeFunction();
        }
      }}
      onExitComplete={closeFunction}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="center"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {t("delete-city")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Badge
            color="sentiment.negativeDefault"
            h="68px"
            w="68px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            background="sentiment.negativeOverlay"
          >
            <FiTrash2 size={36} />
          </Badge>
          {step === 1 ? (
            <Box w="65%" textAlign="center" mt={6}>
              <Text fontSize="body.lg">
                <Trans
                  i18nKey="confirm-city-delete"
                  t={t}
                  values={{
                    name: cityName,
                  }}
                  components={{
                    bold: <strong />,
                  }}
                />
              </Text>
              <Text fontSize="body.lg" mt={4}>
                {t("delete-all-inventories-warning")}
              </Text>
            </Box>
          ) : (
            <Box w="70%" mt={6}>
              <Text fontSize="body.lg" textAlign="center">
                <Trans
                  i18nKey="enter-city-name-confirmation"
                  t={t}
                  values={{
                    name: cityName,
                  }}
                  components={{
                    bold: <strong />,
                  }}
                />
              </Text>
              <Field
                labelClassName="font-semibold"
                mt={6}
                label={t("city-name")}
              >
                <Input
                  value={cityToDelete}
                  onChange={(e) => setCityToDelete(e.target.value)}
                />
              </Field>
            </Box>
          )}
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            variant="solid"
            h="64px"
            disabled={step === 2 && cityToDelete.trim() !== cityName.trim()}
            w="full"
            onClick={step === 1 ? nextFunction : submitFunction}
            color="base.light"
            backgroundColor="sentiment.negativeDefault"
            marginRight="2"
            loading={isLoading}
          >
            {step === 1 ? t("yes-i-understand") : t("delete-city")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default DeleteCityModal;
