import React, { useState } from "react";
import {
  Box,
  Input,
  Tag,
  TagCloseButton,
  TagLabel,
  Wrap,
  HStack,
} from "@chakra-ui/react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/Texts/Body";

interface MultipleEmailInputProps {
  t: TFunction;
  emails: string[];
  setEmails: React.Dispatch<React.SetStateAction<string[]>>;
}

const MultipleEmailInput: React.FC<MultipleEmailInputProps> = ({
  t,
  emails,
  setEmails,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (inputValue.trim() !== "") {
      setError("");
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim() !== "") {
      if (validateEmail(inputValue.trim())) {
        if (!emails.includes(inputValue.trim())) {
          setEmails([...emails, inputValue.trim()]);
          setInputValue("");
          setError("");
        } else {
          setError("email-already-exists");
        }
      } else {
        setError("invalid-email");
      }
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter((email) => email !== emailToRemove));
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  return (
    <Box mt={4}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        isInvalid={!!error}
        errorBorderColor="sentiment.negativeDefault"
        borderColor={"border.neutral"}
        variant="outline"
        backgroundColor={
          error ? "sentiment.negativeOverlay" : "background.default"
        }
      />
      {error ? (
        <HStack>
          <InfoOutlineIcon color="sentiment.negativeDefault" />
          <BodyMedium text={t(error)} />
        </HStack>
      ) : (
        <HStack>
          <InfoOutlineIcon color="interactive.secondary" />
          <BodyMedium text={t("press-enter-to-add")} />
        </HStack>
      )}
      <Wrap mt={2}>
        {emails.map((email, index) => (
          <Tag
            key={index}
            borderRadius="full"
            variant="solid"
            colorScheme="blue"
          >
            <TagLabel>{email}</TagLabel>
            <TagCloseButton onClick={() => handleRemoveEmail(email)} />
          </Tag>
        ))}
      </Wrap>
    </Box>
  );
};

export default MultipleEmailInput;
