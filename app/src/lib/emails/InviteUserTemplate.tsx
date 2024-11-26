import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { CityAttributes } from "@/models/City";
import { UserAttributes } from "@/models/User";
import React, { useState } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Text,
  Img,
  Font,
  Hr,
} from "@react-email/components";

export default function InviteUserTemplate({
  url = "/",
  user = { name: "" },
}: {
  url?: string;
  user?: { name: string };
}) {
  const generatedCode = "2KGuWexgH@!";

  const ImageURL = "https://citycatalyst.openearth.dev/assets/icon.png";
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

      <Preview>CityCatalyst: City Invitation</Preview>
      <Body style={main}>
        <Container style={container}>
          <div style={content}>
            <Img
              src={ImageURL}
              alt="City Catalyst logo"
              width="36"
              height="36"
            />
            <Text style={brandHeading}>CityCatalyst</Text>
            <Text style={heading}>You’ve been invited to try CityCatalyst</Text>
            <Text style={greeting}>Hi {user?.name},</Text>
            <Text style={paragraph}>
              Thank you for your interest in CityCatalyst. You’ve now been
              granted special access. <br /> <br /> Please create your account
              by clicking the button at the end of this email. <br /> <br />{" "}
              Here’s your invite code in case you need to type it.
            </Text>
            <div style={codeBox}>
              <Text style={code}>{generatedCode}</Text>
              <div style={{ marginTop: "16px" }}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <mask
                    id="mask0_581_21683"
                    style={{ maskType: "alpha" }}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width="24"
                    height="24"
                  >
                    <rect width="24" height="24" fill="#2351DC" />
                  </mask>
                  <g mask="url(#mask0_581_21683)">
                    <path
                      d="M5 22C4.45 22 3.97917 21.8042 3.5875 21.4125C3.19583 21.0208 3 20.55 3 20V6H5V20H16V22H5ZM9 18C8.45 18 7.97917 17.8042 7.5875 17.4125C7.19583 17.0208 7 16.55 7 16V4C7 3.45 7.19583 2.97917 7.5875 2.5875C7.97917 2.19583 8.45 2 9 2H18C18.55 2 19.0208 2.19583 19.4125 2.5875C19.8042 2.97917 20 3.45 20 4V16C20 16.55 19.8042 17.0208 19.4125 17.4125C19.0208 17.8042 18.55 18 18 18H9ZM9 16H18V4H9V16Z"
                      fill="#2351DC"
                    />
                  </g>
                </svg>
              </div>
            </div>
            <div
              style={{
                marginTop: "36px",
                marginBottom: "36px",
              }}
            >
              <Link href={url} style={urlLink}>
                SIGN UP NOW
              </Link>
            </div>

            <Hr style={{ height: "2px", background: "#EBEBEC" }} />
            <Text style={footerText}>
              Open Earth Foundation is a nonprofit public benefit corporation
              from California, USA. EIN: 85-3261449
            </Text>
          </div>
        </Container>
      </Body>
    </Html>
  );
}

// Styles for the email template
const main = {
  backgroundColor: "#ffffff",
  paddingTop: "48px",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const content = {
  height: "100%",
  width: "100%",
  border: "1px solid #E6E7FF",
  borderTop: "8px solid #2351DC",
  padding: "48px",
};
const codeBox = {
  backgroundColor: "#E6E7FF",
  width: "200px",
  display: "flex",
  alighItems: "center",
  padding: "16px",
  borderRadius: "8px",
  gap: "16px",
};
const code = {
  color: " #001EA7",
  fontSize: "22px",
  fontWeight: "600",
};
const container = {
  margin: "0 auto",
  padding: "0px 0 0px",
  width: "600px",
  height: "auto",
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
  marginTop: "36px",
  fontWeight: "bold",
};

const footerText = {
  fontSize: "12px",
  lineHeight: "16px",
  fontWeight: "400",
  color: "#79797A",
};
