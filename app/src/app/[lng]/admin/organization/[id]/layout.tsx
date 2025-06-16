"use client";
import {
  Box,
  BreadcrumbItem,
  Icon,
  Spinner,
  Tabs,
  Text,
} from "@chakra-ui/react";
import React, { useMemo, use } from "react";
import { useGetOrganizationQuery } from "@/services/api";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { MdChevronRight } from "react-icons/md";

import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";
import { useTranslation } from "@/i18n/client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import ProgressLoader from "@/components/ProgressLoader";

export default function AdminOrganizationLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; id: string }>;
}) {
  const { children } = props;
  const { lng, id } = use(props.params);
  const { t } = useTranslation(lng, "admin");
  const pathName = usePathname();

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

  const step = useMemo(() => {
    const pathArray = pathName.replace(/\/$/, "").split("/");
    const path = pathArray[pathArray.length - 1];
    if (["profile", "team", "projects"].includes(path)) {
      return path;
    }
    return "profile";
  }, [pathName]);

  if (isOrganizationLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box className="pt-16 pb-16  w-[1090px] mx-auto px-4">
      <Box>
        <BreadcrumbRoot
          gap="8px"
          fontFamily="heading"
          fontWeight="bold"
          letterSpacing="widest"
          fontSize="14px"
          textTransform="uppercase"
          separator={
            <Icon
              as={MdChevronRight}
              boxSize={4}
              color="content.primary"
              h="32px"
            />
          }
        >
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/${lng}/admin`}
              color="content.tertiary"
              fontWeight="normal"
              truncate
              className="capitalize"
            >
              {t("admin-heading")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbCurrentLink color="content.primary">
            <Text truncate lineClamp={1} className="capitalize">
              {!organization ? (
                <Spinner size="xs" />
              ) : (
                t("org-profile-heading", { name: organization.name })
              )}
            </Text>
          </BreadcrumbCurrentLink>
        </BreadcrumbRoot>
      </Box>
      <Text
        fontSize="headline.lg"
        marginTop={2}
        className="capitalize"
        fontWeight="semibold"
      >
        {!organization ? (
          <Spinner size="xs" />
        ) : (
          t("org-account-heading", { name: organization.name })
        )}
      </Text>
      <Box mt={8}>
        <Tabs.Root variant="line" lazyMount defaultValue="profile" value={step}>
          <Tabs.List borderStyle="hidden">
            {["profile", "team", "projects"].map((tab, index) => (
              <Link key={tab} href={`/${lng}/admin/organization/${id}/${tab}`}>
                <Tabs.Trigger key={index} value={tab}>
                  <Text
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="medium"
                  >
                    {t(tab)}
                  </Text>
                </Tabs.Trigger>
              </Link>
            ))}
          </Tabs.List>
        </Tabs.Root>
      </Box>
      <Box marginTop={12}>{children}</Box>
    </Box>
  );
}
