import React, { useState } from "react";
import { Box, Input, Tag, HStack, Separator, Icon } from "@chakra-ui/react";
import { MdInfoOutline } from "react-icons/md";
import type { TFunction } from "i18next";
import { BodyLarge, BodyMedium } from "@/components/Texts/Body";
import { Field } from "@/components/ui/field";

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
      <Field invalid={!!error}>
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          borderColor={"border.neutral"}
          variant="outline"
          backgroundColor={
            error ? "sentiment.negativeOverlay" : "background.default"
          }
        />
      </Field>
      {error ? (
        <HStack my={"5px"}>
          <Icon as={MdInfoOutline} color="sentiment.negativeDefault" />
          <BodyMedium text={t(error)} />
        </HStack>
      ) : (
        <HStack my={"5px"}>
          <Icon as={MdInfoOutline} color="interactive.secondary" />
          <BodyMedium text={t("press-enter-to-add")} />
        </HStack>
      )}
      <Separator my="24px" />
      <Wrap mt={2}>
        {emails.map((email, index) => (
          <Tag.Root
            key={index}
            borderRadius="full"
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
      </Wrap>
    </Box>
  );
};

export default MultipleEmailInput;
