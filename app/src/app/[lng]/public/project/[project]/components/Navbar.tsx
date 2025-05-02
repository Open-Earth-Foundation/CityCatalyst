import { Heading, Link } from "@chakra-ui/react";
import { NavigationBar } from "@/components/navigation-bar";
import type { TFunction } from "i18next";

const ProjectDashboardNavbar = ({
  lng,
  project,
  t,
}: {
  lng: string;
  project: string;
  t: TFunction;
}) => {
  return (
    <NavigationBar lng={lng} isPublic>
      <>
        <Link
          href={`/${lng}/public/project/${project}`}
          className="flex items-center"
        >
          <Heading color="base.light" size="md" className="opacity-75">
            {t("dashboard")}
          </Heading>
        </Link>
        <Link
          href={`/${lng}/public/project/${project}/about`}
          className="flex items-center"
        >
          <Heading color="base.light" size="md" className="opacity-75">
            {t("about")}
          </Heading>
        </Link>
        <Link
          href={`/${lng}/public/project/${project}/collaborators`}
          className="flex items-center"
        >
          <Heading color="base.light" size="md" className="opacity-75">
            {t("collaborators")}
          </Heading>
        </Link>
      </>
    </NavigationBar>
  );
};

export default ProjectDashboardNavbar;
