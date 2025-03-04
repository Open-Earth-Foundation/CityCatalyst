import { Flex, Icon, Badge } from "@chakra-ui/react";
import { MdOutlineLocationOn, MdOutlineTimer, MdToday } from "react-icons/md";
import { DataCheckIcon, ScaleIcon } from "@/components/icons";
import { FiTarget } from "react-icons/fi";
import { DataSourceWithRelations } from "@/app/[lng]/[inventory]/data/[step]/types";
import type { TFunction } from "i18next";

interface SourceDrawerBadgesProps {
  source: DataSourceWithRelations;
  t: TFunction;
}

export default function SourceDrawerBadges({
  source,
  t,
}: SourceDrawerBadgesProps) {
  return (
    <Flex direction="row" my={4} className="gap-4 flex-wrap" alignItems="start">
      <Badge>
        <Icon as={MdOutlineLocationOn} boxSize={4} />
        {t("location")}: {source.geographicalLocation}
      </Badge>
      {source.subCategory?.scope && (
        <Badge>
          <Icon as={FiTarget} boxSize={4} />
          {t("scope")}: {source.subCategory.scope.scopeName}
        </Badge>
      )}
      <Badge>
        <Icon as={ScaleIcon} boxSize={4} />
        {t("scale")}: {t(source.spatialResolution || "unknown")}
      </Badge>
      <Badge>
        <Icon as={DataCheckIcon} boxSize={4} color="content.tertiary" />
        {t("data-quality")}: {t("quality-" + source.dataQuality)}
      </Badge>
      <Badge>
        <Icon as={MdToday} boxSize={4} color="content.tertiary" />
        {t("updated-every")}{" "}
        {source.frequencyOfUpdate == "annual"
          ? t("year")
          : t(source.frequencyOfUpdate ?? "unknown")}
      </Badge>
      <Badge>
        <Icon as={MdOutlineTimer} boxSize={4} color="content.tertiary" />
        {source.startYear} - {source.endYear}
      </Badge>
    </Flex>
  );
}
