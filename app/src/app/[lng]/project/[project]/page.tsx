import ProjectMap from "./ProjectMap";

export default function ProjectPage({
  params: { project, lng },
}: {
  params: { project: string; lng: string };
}) {
  return <ProjectMap height={800} width={800} projectId={project} />;
}
