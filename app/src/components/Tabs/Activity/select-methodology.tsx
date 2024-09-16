import { Box, Link, SimpleGrid, Text } from "@chakra-ui/react";
import { Trans } from "react-i18next";
import MethodologyCard from "@/components/Cards/methodology-card";
import React, { useState } from "react";
import { DirectMeasure, Methodology } from "@/util/form-schema";
import { TFunction } from "i18next";
import HeadingText from "@/components/heading-text";

const SelectMethodology = ({
  t,
  methodologies,
  handleMethodologySelected,
  directMeasure,
}: {
  t: TFunction;
  methodologies: Methodology[];
  handleMethodologySelected: (methodology: Methodology) => void;
  directMeasure?: DirectMeasure;
}) => {
  const [selectedMethodology, setSelectedMethodology] = useState("");

  function handleCardSelect(
    disabled: boolean | undefined,
    inputRequired: string[] | undefined,
    id: string,
    fields: any,
  ) {
    return () =>
      handleMethodologySelected({
        disabled: !!disabled,
        inputRequired,
        id,
        fields,
      });
  }

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        mb="8px"
      >
        <HeadingText title={t("select-methodology-title")} />
      </Box>
      <Box>
        <Text
          letterSpacing="wide"
          fontSize="body.lg"
          fontWeight="normal"
          color="interactive.control"
        >
          <Trans t={t} i18nKey="add-data-manually-desciption">
            To add your inventory data manually, select the methodology used to
            collect the data and calculate your emissions.{" "}
            <Link
              href="https://ghgprotocol.org/ghg-protocol-cities"
              color="content.link"
              fontWeight="bold"
              textDecoration="underline"
              target="_blank"
              rel="noreferrer noopener"
            >
              Learn more
            </Link>{" "}
            about methodologies
          </Trans>
        </Text>
        <Text
          fontWeight="bold"
          fontSize="title.md"
          fontFamily="heading"
          pt="48px"
          pb="24px"
        >
          {t("select-methodology")}
        </Text>
        <SimpleGrid minChildWidth="250px" spacing={4}>
          {(methodologies || []).map(
            ({ id, disabled, activities, inputRequired }) => (
              <MethodologyCard
                id={id}
                key={id}
                inputRequired={inputRequired}
                isSelected={selectedMethodology === id}
                disabled={!!disabled}
                t={t}
                handleCardSelect={handleCardSelect(
                  disabled,
                  inputRequired,
                  id,
                  activities,
                )}
              />
            ),
          )}
          {directMeasure?.id && (
            <MethodologyCard
              id={directMeasure.id}
              key={directMeasure.id}
              isSelected={selectedMethodology === directMeasure.id}
              t={t}
              handleCardSelect={handleCardSelect(
                false,
                ["emissions-data"],
                directMeasure.id,
                directMeasure["extra-fields"],
              )}
              disabled={false}
            />
          )}
        </SimpleGrid>
      </Box>
    </>
  );
};

export default SelectMethodology;
