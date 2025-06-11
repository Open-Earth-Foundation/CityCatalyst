import React, { useState } from "react";
import {
  Box,
  Input,
  Tag,
  HStack,
  Separator,
  Icon,
  Flex,
} from "@chakra-ui/react";
import { MdInfoOutline } from "react-icons/md";
import type { TFunction } from "i18next";
import { BodyLarge, BodyMedium } from "@/components/Texts/Body";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

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

  const addEmails = (inputValue: string) => {
    if (inputValue.trim() !== "" && validateEmail(inputValue.trim())) {
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
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      addEmails(inputValue);
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
    <Box mt={3}>
      <Field invalid={!!error}>
        <HStack w="full">
          <Input
            flex={1}
            value={inputValue}
            onChange={handleInputChange}
            placeholder={t("email")}
            onKeyDown={handleInputKeyDown}
            borderColor={"border.neutral"}
            variant="outline"
            backgroundColor={
              error ? "sentiment.negativeOverlay" : "background.default"
            }
          />
          <Button onClick={() => addEmails(inputValue)}>
            {t("enter-to-add")}
          </Button>
        </HStack>
      </Field>
      {error ? (
        <HStack my={"5px"}>
          <Icon as={MdInfoOutline} color="sentiment.negativeDefault" />
          <BodyMedium text={t(error)} />
        </HStack>
      ) : null}
      <Flex flexWrap="wrap" gap={2} mt={2}>
        {emails.map((email, index) => (
          <Tag.Root
            key={index}
            variant="solid"
            backgroundColor="background.neutral"
          >
            <BodyLarge text={email} color="content.alternative" />
            <Tag.EndElement>
              <Tag.CloseTrigger
                color="interactive.control"
                onClick={() => handleRemoveEmail(email)}
              />
            </Tag.EndElement>
          </Tag.Root>
        ))}
      </Flex>
    </Box>
  );
};

export default MultipleEmailInput;
