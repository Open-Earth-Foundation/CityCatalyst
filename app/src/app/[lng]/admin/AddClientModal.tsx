"use client";

import {
  Button,
  Input,
  Textarea,
  VStack,
  Box,
  Text,
} from "@chakra-ui/react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogCloseTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import React, { useState } from "react";
import { api } from "@/services/api";

interface AddClientModalProps {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
}

const AddClientModal: React.FC<AddClientModalProps> = ({ lng, isOpen, onClose }) => {
  const { t } = useTranslation(lng, "admin");

  const [addClient, { isLoading }] = api.useAddClientMutation();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    redirectUri: "",
  });

  const [errors, setErrors] = useState({
    name: "",
    description: "",
    redirectUri: "",
  });

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const validateForm = () => {
    const newErrors = {
      name: "",
      description: "",
      redirectUri: "",
    };

    if (!formData.name.trim()) {
      newErrors.name = t("oauth-client-name-required") || "Name is required";
    }

    if (!formData.description.trim()) {
      newErrors.description = t("oauth-client-description-required") || "Description is required";
    }

    if (!formData.redirectUri.trim()) {
      newErrors.redirectUri = t("oauth-client-redirect-uri-required") || "Redirect URI is required";
    } else {
      // Basic URL validation
      try {
        new URL(formData.redirectUri);
      } catch {
        newErrors.redirectUri = t("oauth-client-invalid-uri") || "Please enter a valid URL";
      }
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== "");
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage("");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage("");
    setTimeout(() => setErrorMessage(""), 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await addClient({
        name: { [lng]: formData.name, en: formData.name },
        description: { [lng]: formData.description, en: formData.description },
        redirectUri: formData.redirectUri,
      }).unwrap();

      showSuccess(t("oauth-client-created") || "Client created successfully");

      // Reset form and close modal after a brief delay
      setTimeout(() => {
        setFormData({ name: "", description: "", redirectUri: "" });
        setErrors({ name: "", description: "", redirectUri: "" });
        onClose();
      }, 1500);
    } catch (error: any) {
      showError(
        error?.data?.message ||
        t("oauth-client-creation-failed") ||
        "Failed to create client"
      );
    }
  };

  const handleClose = () => {
    setFormData({ name: "", description: "", redirectUri: "" });
    setErrors({ name: "", description: "", redirectUri: "" });
    setSuccessMessage("");
    setErrorMessage("");
    onClose();
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <DialogRoot open={isOpen} onOpenChange={(details) => !details.open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("oauth-add-client-title") || "Add OAuth Client"}</DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            {successMessage && (
              <Box bg="green.50" border="1px" borderColor="green.200" p={3} borderRadius="md" mb={4}>
                <Text color="green.800" fontSize="sm">{successMessage}</Text>
              </Box>
            )}

            {errorMessage && (
              <Box bg="red.50" border="1px" borderColor="red.200" p={3} borderRadius="md" mb={4}>
                <Text color="red.800" fontSize="sm">{errorMessage}</Text>
              </Box>
            )}

            <VStack gap={4}>
              <Box w="100%">
                <Text as="label" fontWeight="medium" mb={2} display="block">
                  {t("oauth-client-name") || "Client Name"} *
                </Text>
                <Input
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder={t("oauth-client-name-placeholder") || "Enter client name"}
                  borderColor={errors.name ? "red.500" : undefined}
                />
                {errors.name && (
                  <Text color="red.500" fontSize="sm" mt={1}>
                    {errors.name}
                  </Text>
                )}
              </Box>

              <Box w="100%">
                <Text as="label" fontWeight="medium" mb={2} display="block">
                  {t("oauth-client-description") || "Description"} *
                </Text>
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder={t("oauth-client-description-placeholder") || "Enter client description"}
                  rows={3}
                  borderColor={errors.description ? "red.500" : undefined}
                />
                {errors.description && (
                  <Text color="red.500" fontSize="sm" mt={1}>
                    {errors.description}
                  </Text>
                )}
              </Box>

              <Box w="100%">
                <Text as="label" fontWeight="medium" mb={2} display="block">
                  {t("oauth-redirect-uri") || "Redirect URI"} *
                </Text>
                <Input
                  value={formData.redirectUri}
                  onChange={(e) => handleInputChange("redirectUri", e.target.value)}
                  placeholder="https://example.com/callback"
                  type="url"
                  borderColor={errors.redirectUri ? "red.500" : undefined}
                />
                {errors.redirectUri && (
                  <Text color="red.500" fontSize="sm" mt={1}>
                    {errors.redirectUri}
                  </Text>
                )}
              </Box>
            </VStack>
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" mr={3} onClick={handleClose}>
              {t("cancel") || "Cancel"}
            </Button>
            <Button
              type="submit"
              bg="interactive.secondary"
              color="base.light"
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading ? (t("creating") || "Creating...") : (t("oauth-add-client") || "Add Client")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
};

export default AddClientModal;