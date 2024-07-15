import HeadingText from "@/components/heading-text";
import {
  Box,
  Button,
  Radio,
  RadioGroup,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";

interface ScopeUnavailableProps {
  t: TFunction;
}

const ScopeUnavailable: FC<ScopeUnavailableProps> = ({ t }) => {
  return (
    <Box bg="base.light" borderRadius="8px" p="24px">
      <HeadingText title={t("scope-unavailable")} />
      <Text
        letterSpacing="wide"
        fontSize="body.lg"
        fontWeight="normal"
        color="interactive.control"
        mt="8px"
      >
        {t("scope-unavailable-description")}
      </Text>
      <Box mt="48px">
        <Text
          fontWeight="bold"
          fontSize="title.md"
          fontFamily="heading"
          pt="48px"
          pb="24px"
        >
          {t("select-reason")}
        </Text>
        <RadioGroup>
          <Stack direction="column">
            <Radio value={t("select-reason-1")} color="interactive.secondary">
              {t("select-reason-1")}
            </Radio>
            <Radio value={t("select-reason-2")}>{t("select-reason-2")}</Radio>
            <Radio value={t("select-reason-3")}>{t("select-reason-3")}</Radio>
            <Radio value={t("select-reason-4")}>{t("select-reason-4")}</Radio>
          </Stack>
        </RadioGroup>
        <Text
          fontWeight="medium"
          fontSize="title.md"
          fontFamily="heading"
          pt="48px"
          pb="24px"
          letterSpacing="wide"
        >
          {t("explanation-justification")}
        </Text>
        <Textarea
          borderRadius="4px"
          borderWidth="1px"
          borderColor="border.neutral"
          backgroundColor="base.light"
          placeholder={t("textarea-placeholder-text")}
        />
        <Button h="48px" p="16px" mt="24px">
          {t("save-changes")}
        </Button>
      </Box>
    </Box>
  );
};

export default ScopeUnavailable;
