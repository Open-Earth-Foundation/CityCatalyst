/* eslint-disable i18next/no-literal-string */

import { Box, Container, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import NextLink from "next/link";
import Image from "next/image";

const Collaborators = ({ lng, project }: { lng: string; project: string }) => {
  return (
    <Box py={16} px={{ base: 6, md: 10, lg: 16 }} bg="white" w="full">
      <Container maxW="7xl">
        <Heading
          fontSize="headline.md"
          fontWeight="bold"
          textAlign="center"
          mb={8}
        >
          Collaborators
        </Heading>
        <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={8}>
          <Flex flexDirection="column" alignItems="center">
            <Text
              fontSize="Headline.sm"
              textAlign="center"
              fontWeight="bold"
              mb={4}
            >
              Developed by
            </Text>
            <Flex gap={6} align="center">
              <Image
                src="/assets/projects_dashboard/openearth.png"
                alt="openearth"
                width={123}
                height={28}
              />
              <Image
                src="/assets/projects_dashboard/icare_logo.png"
                alt="C40 Cities"
                width={80}
                height={36}
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" alignItems="center">
            <Text fontSize="Headline.sm" fontWeight="bold" mb={4}>
              A commitment from
            </Text>
            <Flex gap={6} align="center">
              <Image
                src="/assets/projects_dashboard/brazil_ministry_logo.png"
                alt="Brazilian Government"
                height={150}
                width={150}
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" alignItems="center">
            <Text fontSize="Headline.sm" fontWeight="bold" mb={4}>
              Supported by
            </Text>
            <Flex gap={6} align="center">
              <Image
                src="/assets/projects_dashboard/global_covenant_logo.png"
                alt="Global Covenant of Mayors"
                height={80}
                width={80}
              />
              <Image
                src="/assets/projects_dashboard/c40_cities_logo.png"
                alt="C40 Cities"
                height={80}
                width={80}
              />
              <Image
                src="/assets/projects_dashboard/cdp_logo.png"
                alt="CDP"
                height={80}
                width={80}
              />
            </Flex>
          </Flex>
        </Grid>

        <Flex mt={12} flexDir="column" alignItems="center">
          <Text fontSize="title.sm" fontWeight="bold" mb={4}>
            With collaboration from
          </Text>
          <Flex gap={6} align="center" justifyContent="space-between" w="full">
            <Image
              src="/assets/projects_dashboard/iclei.png"
              alt="ICLEI"
              height={80}
              width={80}
            />
            <Image
              src="/assets/projects_dashboard/seeg.png"
              alt="SEEG"
              height={80}
              width={80}
            />
            <Image
              src="/assets/projects_dashboard/fnp.png"
              alt="SEEG"
              height={80}
              width={80}
            />
            <Image
              src="/assets/projects_dashboard/adapta-brazil.png"
              alt="CC"
              height={80}
              width={80}
            />
            <Image
              src="/assets/projects_dashboard/climate-trace.png"
              alt="CC"
              height={80}
              width={80}
            />
          </Flex>
          <Box mt={2}>
            <NextLink href={`/${lng}/public/project/${project}/collaborators`}>
              <Button variant="outline">About the collaborators</Button>
            </NextLink>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
};

export default Collaborators;
