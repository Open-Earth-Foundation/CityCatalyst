/* eslint-disable i18next/no-literal-string */
import React from "react";
import {
  Body,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { User } from "@/models/User";
import { Project } from "@/models/Project";

export default function ProjectDeletedNotificationTemplate({
  url,
  user,
  project,
  organizationName,
}: {
  url: string;
  project: Project;
  user: User | null;
  organizationName: string;
}) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Roboto"
          fallbackFontFamily="Verdana"
          webFont={{
            url: "https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>

      <Preview>CityCatalyst: Project Deleted</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandHeading}>CityCatalyst</Text>
          <Text style={headingGreen}>
            {" "}
            Project deleted on <span style={heading}>
              {organizationName}
            </span>{" "}
            account
          </Text>
          <Text style={greeting}>Hi {user?.name},</Text>
          <Text style={paragraph}>The {project?.name} project has deleted</Text>
          <div
            style={{
              marginTop: "36px",
              marginBottom: "36px",
            }}
          >
            <Link href={url} style={urlLink}>
              Sign In
            </Link>
          </div>

          <Hr style={{ height: "2px", background: "#EBEBEC" }} />
          <Text style={footerText}>
            Open Earth Foundation is a nonprofit public benefit corporation from
            California, USA. EIN: 85-3261449
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles for the email template
const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 48px 48px",
  width: "580px",
  borderTop: "2px solid #2351DC",
};

const brandHeading = {
  fontSize: "20px",
  lineHeight: "1.5",
  fontWeight: "700",
  color: "#2351DC",
};


const heading = {
  fontSize: "24px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#484848",
  marginTop: "50px",
};

const headingGreen = {
  fontSize: "24px",
  lineHeight: "32px",
  fontWeight: "700",
  color: "#24BE00",
  marginTop: "50px",
};

const greeting = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#484848",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "1.4",
  color: "#484848",
};

const urlLink = {
  fontSize: "14px",
  padding: "16px",
  backgroundColor: "#2351DC",
  borderRadius: "100px",
  lineHeight: 1.5,
  color: "#FFF",
  display: "inline-block",
  paddingLeft: "36px",
  paddingRight: "36px",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};
