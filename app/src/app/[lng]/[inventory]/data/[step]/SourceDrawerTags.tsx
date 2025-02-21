import { Flex, Icon, TagLabel } from "@chakra-ui/react";
import { MdOutlineLocationOn, MdOutlineTimer, MdToday } from "react-icons/md";
import { DataCheckIcon, ScaleIcon } from "@/components/icons";
import { FiTarget } from "react-icons/fi";
import { Tag } from "@/components/ui/tag";
import { DataSourceWithRelations } from "@/app/[lng]/[inventory]/data/[step]/types";
import type { TFunction } from "i18next";

interface SourceDrawerTagsProps {
  source: DataSourceWithRelations;
  t: TFunction;
}

export default function SourceDrawerTags({ source, t }: SourceDrawerTagsProps) {
  return (
    <Flex direction="row" my={4} className="gap-4 flex-wrap" alignItems="start">
      <Tag
        startElement={<Icon as={MdOutlineLocationOn} boxSize={4} mr={2} />}
        border={0}
      >
        <TagLabel>
          {t("Location")}: {source.geographicalLocation?.toLowerCase()}
        </TagLabel>
      </Tag>
      {source.subCategory?.scope && (
        <Tag border={0} startElement={<Icon as={FiTarget} boxSize={4} />}>
          <TagLabel>
            {t("scope")}: {source.subCategory.scope.scopeName}
          </TagLabel>
        </Tag>
      )}
      <Tag border={0} startElement={<Icon as={ScaleIcon} boxSize={4} />}>
        <TagLabel>
          {t("scale")}: {t(source.spatialResolution || "unknown")}
        </TagLabel>
      </Tag>

      <Tag
        startElement={
          <Icon
            as={DataCheckIcon}
            boxSize={4}
            mr={2}
            color="content.tertiary"
          />
        }
      >
        <TagLabel>
          {t("data-quality")}: {t("quality-" + source.dataQuality)}
        </TagLabel>
      </Tag>
      <Tag
        startElement={
          <Icon as={MdToday} boxSize={4} color="content.tertiary" />
        }
      >
        <TagLabel>
          {t("updated-every")}{" "}
          {source.frequencyOfUpdate == "annual"
            ? t("year")
            : t(source.frequencyOfUpdate ?? "unknown")}
        </TagLabel>
      </Tag>
      <Tag
        startElement={
          <Icon as={MdOutlineTimer} boxSize={4} color="content.tertiary" />
        }
      >
        <TagLabel>
          {source.startYear} - {source.endYear}
        </TagLabel>
      </Tag>
    </Flex>
  );
}
