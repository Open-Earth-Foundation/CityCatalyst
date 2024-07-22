"use client";

import { Link } from "@chakra-ui/react";
import React, { FC } from "react";

interface FooterLinkProps {
  title: string;
  url: string;
}

const FooterLink: FC<FooterLinkProps> = ({ title, url }) => {
  return (
    <Link
      href={url}
      rel="noopener noreferrer"
      target="_blank"
      fontSize="body.md"
      fontWeight="medium"
      lineHeight="20"
      letterSpacing="wide"
      color="base.light"
    >
      {title}
    </Link>
  );
};

export default FooterLink;
