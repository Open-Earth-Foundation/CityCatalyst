"use client";

import { Box, Button, Heading, Icon, Link, Text } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { BsPlus } from "react-icons/bs";
import React, { useState } from "react";
import CreateOrganizationModal from "@/app/[lng]/admin/CreateOrganizationModal";

const AdminPage = ({ params: { lng } }: { params: { lng: string } }) => {
  const { t } = useTranslation(lng, "admin");
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <Box className="pt-16 pb-16  w-[1090px] mx-auto px-4">
      <Link href="/" _hover={{ textDecoration: "none" }}>
        <Box
          display="flex"
          alignItems="center"
          gap="8px"
          color="content.tertiary"
        >
          <Text
            textTransform="uppercase"
            fontFamily="heading"
            fontSize="body.lg"
            fontWeight="normal"
          >
            {t("go-back")}
          </Text>
        </Box>
      </Link>
      <Heading
        fontSize="headline.lg"
        fontWeight="semibold"
        color="content.primary"
        mb={12}
        mt={2}
        className="w-full"
      >
        {t("admin-heading")}
      </Heading>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Heading
            fontSize="headline.sm"
            mb={2}
            fontWeight="semibold"
            lineHeight="32px"
            fontStyle="normal"
            textTransform="capitalize"
            color="content.secondary"
          >
            {t("oef-organizations")}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("admin-caption")}
          </Text>
        </Box>
        <Button
          onClick={() => setIsModalOpen(true)}
          variant="ghost"
          h="48px"
          bg="interactive.secondary"
          color="base.light"
          mt="auto"
        >
          <Icon as={BsPlus} h={8} w={8} />
          {t("add-organization")}
        </Button>
      </Box>
      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        t={t}
        onOpenChange={setIsModalOpen}
      />
    </Box>
  );
};

export default AdminPage;
