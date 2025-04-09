import { Heading, Link } from "@chakra-ui/react";
import { NavigationBar } from "@/components/navigation-bar";

const ProjectDashboardNavbar = ({
  lng,
  project,
}: {
  lng: string;
  project: string;
}) => {
  return (
    <NavigationBar lng={lng} isPublic>
      <>
        <Link
          href={`/${lng}/public/project/${project}`}
          className="flex items-center"
        >
          <Heading color="base.light" size="md" className="opacity-75">
            {"dashboard"}
          </Heading>
        </Link>
        <Link
          href={`/${lng}/public/project/${project}/about`}
          className="flex items-center"
        >
          <Heading color="base.light" size="md" className="opacity-75">
            {"about"}
          </Heading>
        </Link>
        <Link
          href={`/${lng}/public/project/${project}/collaborators`}
          className="flex items-center"
        >
          <Heading color="base.light" size="md" className="opacity-75">
            {"collaborators"}
          </Heading>
        </Link>
      </>
    </NavigationBar>
  );
};

export default ProjectDashboardNavbar;
