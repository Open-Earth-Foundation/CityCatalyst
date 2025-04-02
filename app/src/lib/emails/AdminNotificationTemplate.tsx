/* eslint-disable i18next/no-literal-string */
import { ExcelFileIcon } from "@/components/icons";
import { bytesToMB } from "@/util/helpers";
import { UserFileResponse } from "@/util/types";
import React from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Text,
  Hr,
} from "@react-email/components";

export default function AdminNotificationTemplate({
  user,
  file,
  adminNames,
  inventoryId,
}: {
  user: { name: string; email: string; cityName: string };
  file: UserFileResponse;
  adminNames: string;
  inventoryId: string;
}) {
  const host = process.env.HOST ?? "http://localhost:3000";
  return (
    <Html>
      <Head />
      <Preview>CityCatalyst: File Upload</Preview>
      <Body style={main}>
        <Container style={container}>
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M30.7279 5.27208C27.3279 1.87201 22.8081 0 18 0C13.1919 0 8.67214 1.87201 5.27208 5.27208C1.87201 8.67214 0 13.1919 0 18C0 22.8081 1.87201 27.3279 5.27208 30.7279C8.67214 34.128 13.1919 36 18 36C22.8081 36 27.3279 34.128 30.7279 30.7279C34.128 27.3279 36 22.8081 36 18C36 13.1919 34.128 8.67214 30.7279 5.27208ZM1.79737 18.6821C1.95105 14.7565 3.66938 11.1135 6.63474 8.42039C9.59278 5.73459 13.4056 4.34266 17.3633 4.49195C23.8136 4.73931 28.8588 10.1899 28.6115 16.6403C28.5178 19.0685 27.4947 21.3269 25.731 22.9984C23.9702 24.6669 21.6679 25.5627 19.2353 25.532H19.0641C18.1815 25.4632 17.0633 25.1558 16.3417 24.1166C16.2992 24.0551 16.2583 23.9922 16.2187 23.9278C16.21 23.9132 16.2012 23.9 16.1924 23.8853C14.1901 20.538 17.3282 18.6382 17.3282 16.3753C17.3282 13.8813 15.4913 12.9563 14.578 12.8216C10.9379 12.2844 9.89283 15.8836 9.73914 17.2784C9.59278 18.6103 9.7772 19.995 10.3275 21.321C10.6891 22.1919 11.2291 22.9779 11.898 23.6556L11.8951 23.6585C13.8754 25.6388 16.4617 26.6531 19.0626 26.6999C19.127 26.6999 19.19 26.7014 19.2544 26.7014C19.2953 26.6999 19.3378 26.7014 19.3788 26.7014C22.0529 26.7014 24.5894 25.69 26.536 23.8458C28.5222 21.9636 29.6756 19.4197 29.7809 16.6842C30.0532 9.58985 24.5045 3.59619 17.4101 3.32249C17.1994 3.31371 16.9886 3.31078 16.7779 3.31078C12.7382 3.31078 8.87852 4.80371 5.85022 7.55391C5.28525 8.06619 4.76565 8.6136 4.28557 9.18588C7.19093 4.68076 12.2522 1.69198 18 1.69198C25.8876 1.69198 32.4843 7.32119 33.986 14.7726C34.0826 15.5952 34.1338 16.4383 34.1338 17.3048C33.9802 21.2303 32.2618 24.8733 29.2965 27.5664C26.3384 30.2522 22.5256 31.6442 18.5679 31.4949C12.1176 31.2461 7.07237 25.7969 7.31973 19.3466C7.4134 16.9184 8.43649 14.6599 10.2002 12.9885C11.961 11.3199 14.2633 10.4241 16.6959 10.4549H16.8686C17.7512 10.5237 18.8694 10.831 19.591 11.8702C19.6334 11.9317 19.6744 11.9946 19.7139 12.059C19.7227 12.0737 19.7315 12.0868 19.7403 12.1C21.7426 15.4474 18.6045 17.3472 18.6045 19.61C18.6045 22.1041 20.4414 23.0291 21.3547 23.1638C24.9948 23.7009 26.0398 20.1018 26.1935 18.7055C26.3384 17.3736 26.1555 15.9889 25.6051 14.6629C25.2436 13.792 24.7035 13.006 24.0346 12.3283L24.0376 12.3254C22.0572 10.3451 19.471 9.33078 16.8701 9.28395C16.8057 9.28395 16.7427 9.28248 16.6783 9.28248C16.6373 9.28395 16.5949 9.28248 16.5539 9.28248C13.8798 9.28248 11.3433 10.2939 9.39665 12.1381C7.41047 14.0203 6.25711 16.5642 6.15319 19.2997C5.88096 26.394 11.4297 32.3877 18.524 32.6614C18.7348 32.6702 18.9455 32.6731 19.1563 32.6731C23.196 32.6731 27.0556 31.1802 30.0839 28.43C30.7762 27.8006 31.4041 27.1244 31.9676 26.4058C29.1091 31.1348 23.919 34.3022 18.0029 34.3022C9.79916 34.3022 2.99171 28.2104 1.86177 20.314C1.82225 19.7769 1.80029 19.2324 1.80029 18.6777L1.79737 18.6821Z"
              fill="#001EA7"
            />
          </svg>
          <Text style={brandHeading}>CityCatalyst</Text>
          <Text style={heading}>
            {user.name} From {user.cityName} Uploaded New Files For Review
          </Text>
          <Text style={greeting}>Hi {adminNames},</Text>
          <Text style={paragraph}>
            {" "}
            {user.name} ({user.email}) has uploaded files in CityCatalyst for
            revision and to upload to their inventories.
          </Text>

          <Link
            href={`${host}/api/v0/user/file/${file.id}/download-file`}
            key={file.id}
            download
          >
            <div style={cityBox}>
              <ExcelFileIcon />
              <div>
                <Text
                  style={{
                    fontSize: "14px",
                    fontStyle: "normal",
                    fontWeight: "500",
                    letterSpacing: "0.5px",
                    color: "black",
                    marginBottom: "-15px",
                  }}
                >
                  {file.fileName}
                </Text>
                <Text
                  style={{
                    fontSize: "14px",
                    fontStyle: "normal",

                    letterSpacing: "0.5px",
                    color: "#7A7B9A",
                  }}
                >
                  {bytesToMB(file.file.size)}
                </Text>
                <div style={tagBox}>
                  {file.subsectors?.map((item: string) => (
                    <div key={item} style={tag}>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Link>

          <div
            style={{
              marginTop: "36px",
              marginBottom: "36px",
            }}
          >
            <Link
              href={`${host}/${inventoryId}/settings/?tabIndex=1`}
              style={urlLink}
            >
              GO TO REVIEW
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

const tag = {
  padding: "6px",
  paddingLeft: "8px",
  paddingRight: "8px",
  display: "flex",
  alignItems: "center",
  width: "150px",
  whiteSpace: "nowrap",
  borderRadius: "30px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  background: "#e8eafb",
  color: "#2351dc",
  marginRight: "8px",
};

const tagBox = {
  display: "flex",
};

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "580px",
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

const cityBox = {
  display: "flex",
  paddingLeft: "16px",
  alignItems: "center",
  gap: "16px",
  height: "150px",
  borderRadius: "8px",
  border: "1px solid #E6E7FF",
  marginTop: "36px",
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
