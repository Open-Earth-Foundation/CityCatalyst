import { PublicProjectService } from "@/backend/PublicProjectService";
import ProjectNotFound from "./components/ProjectNotFound";
import ProjectPageShell from "./components/ProjectPageShell";
import type { PartnerLogo } from "./components/PartnerLogo";

const footerProps = {
  copyright: "© 2025 CHAMP Brazil Cities Initiative",
  links: [
    { label: "Privacy Policy", href: "#privacy" },
    { label: "Terms of Use", href: "#terms" },
    { label: "Contact", href: "#contact" },
  ],
};

const partners: PartnerLogo[] = [
  {
    id: "1",
    name: "CDP - Disclosure Insight Action",
    logo: "/assets/projects_dashboard/cdp_logo.png",
  },
  {
    id: "2",
    name: "Ministério do Meio Ambiente e Mudança do Clima",
    logo: "/assets/projects_dashboard/brazil_ministry_logo.png",
  },
  {
    id: "3",
    name: "C40 Cities",
    logo: "/assets/projects_dashboard/c40_cities_logo.png",
  },
  {
    id: "4",
    name: "Global Covenant of Mayors for Climate & Energy",
    logo: "/assets/projects_dashboard/global_covenant_logo.png",
  },
  {
    id: "5",
    name: "Icare",
    logo: "/assets/projects_dashboard/icare_logo.png",
  },
  {
    id: "6",
    name: "Openearth",
    logo: "/assets/projects_dashboard/openearth.png",
  },
];

export default async function ProjectPage(props: {
  params: Promise<{ project: string; lng: string }>;
}) {
  const { lng, project } = await props.params;

  const shell = await PublicProjectService.getProjectShell(project);

  if (shell.status === "not-found") {
    return <ProjectNotFound lng={lng} />;
  }

  const [summary, boundaries] = await Promise.all([
    PublicProjectService.getSummary(project),
    PublicProjectService.getBoundaries(project),
  ]);

  return (
    <ProjectPageShell
      lng={lng}
      project={project}
      organization={shell.organization}
      cities={shell.cities}
      summary={summary}
      boundaries={boundaries.result}
      partners={partners}
      footerProps={footerProps}
    />
  );
}
