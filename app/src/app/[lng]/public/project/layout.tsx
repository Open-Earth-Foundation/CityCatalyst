import { Box } from "@chakra-ui/react";

// Every page under /public/project/[project] renders its own tabbed
// navbar (components/Navbar.tsx, wrapping NavigationBar with
// Dashboard/About/Collaborators links) - this layout must not render
// NavigationBar itself, or it shows twice.
export default async function DataLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Box w="full" h="full">
        {props.children}
      </Box>
    </Box>
  );
}
