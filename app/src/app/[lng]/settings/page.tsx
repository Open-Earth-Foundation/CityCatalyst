"use client";

import React, { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/client";
import { Trans } from "react-i18next/TransWithoutContext";
import { NavigationBar } from "@/components/navigation-bar";
import {
  Box,
  Button,
  Input,
  Select,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";

import { useSession } from "next-auth/react";
import FormInput from "@/components/form-input";
import FormSelectInput from "@/components/form-select-input";
import { SubmitHandler, useForm } from "react-hook-form";
import { Session } from "next-auth";

type ProfileInputs = {
  name: string;
  email: string;
  city: string;
  role: string;
};

export default function Settings({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { data: session, status } = useSession();
  const [inputValue, setInputValue] = useState<string>("");
  const { t } = useTranslation(lng, "settings");

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ProfileInputs>();

  useEffect(() => {
    if (session?.user && status === "authenticated") {
      setValue("name", session.user?.name!);
      setValue("city", "City");
      setValue("email", session.user.email!);
      setValue("role", "admin");
    }
  }, [setValue, session, status]);

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    console.log(data);
  };

  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
    console.log(e.target.value);
  };

  return (
    <Box backgroundColor="background.backgroundLight" paddingBottom="125px">
      <NavigationBar lng={lng} />
      <Box className="flex mx-auto w-[1090px] h-[100%]">
        <Box>
          <Box paddingTop="64px">
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="40"
              fontSize="headline.lg"
              fontFamily="body"
            >
              Settings
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontFamily="heading"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              Connect third-party data or upload your own data in order to
              compile your GHG inventory with GPC Basic methodology
            </Text>
          </Box>
          <Box marginTop="48px" borderBottomColor={"border.overlay"}>
            <Tabs>
              <TabList>
                <Tab>
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    My Profile
                  </Text>
                </Tab>
                <Tab>
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    My Files
                  </Text>
                </Tab>
                <Tab>
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    My Inventories
                  </Text>
                </Tab>
              </TabList>

              <TabPanels className="-ml-4">
                <TabPanel>
                  <Box
                    display="flex"
                    flexDirection="column"
                    gap="48px"
                    marginTop="32px"
                  >
                    <Box>
                      <Text
                        color="content.primary"
                        fontWeight="bold"
                        lineHeight="32"
                        fontSize="headline.sm"
                        fontFamily="body"
                        fontStyle="normal"
                      >
                        My Profile
                      </Text>
                      <Text
                        color="content.tertiary"
                        fontWeight="normal"
                        lineHeight="24"
                        fontFamily="heading"
                        fontSize="body.lg"
                        letterSpacing="wide"
                        marginTop="8px"
                      >
                        Here you can find and edit all your profile information.
                      </Text>
                    </Box>
                    <Box>
                      <Tabs
                        display="flex"
                        flexDirection="row"
                        variant="soft-rounded"
                        gap="36px"
                      >
                        <TabList
                          display="flex"
                          flexDirection="column"
                          gap="12px"
                        >
                          <Tab
                            sx={{
                              w: "223px",
                              justifyContent: "left",
                              h: "52px",
                              letterSpacing: "wide",
                              color: "content.secondary",
                              lineHeight: "20px",
                              fontStyle: "normal",
                              fontSize: "label.lg",
                              fontWeight: "medium",
                            }}
                            _selected={{
                              color: "content.link",
                              fontSize: "label.lg",
                              fontWeight: "medium",
                              backgroundColor: "background.neutral",
                              borderRadius: "8px",
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderColor: "content.link",
                            }}
                          >
                            Account Details
                          </Tab>
                          <Tab
                            sx={{
                              w: "223px",
                              justifyContent: "left",
                              h: "52px",
                              letterSpacing: "wide",
                              color: "content.secondary",
                              lineHeight: "20px",
                              fontStyle: "normal",
                              fontSize: "label.lg",
                              fontWeight: "medium",
                            }}
                            _selected={{
                              color: "content.link",
                              fontSize: "label.lg",
                              fontWeight: "medium",
                              backgroundColor: "background.neutral",
                              borderRadius: "8px",
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderColor: "content.link",
                            }}
                          >
                            Users
                          </Tab>
                          <Tab
                            sx={{
                              w: "223px",
                              justifyContent: "left",
                              h: "52px",
                              letterSpacing: "wide",
                              color: "content.secondary",
                              lineHeight: "20px",
                              fontStyle: "normal",
                              fontSize: "label.lg",
                              fontWeight: "medium",
                            }}
                            _selected={{
                              color: "content.link",
                              fontSize: "label.lg",
                              fontWeight: "medium",
                              backgroundColor: "background.neutral",
                              borderRadius: "8px",
                              borderWidth: "1px",
                              borderStyle: "solid",
                              borderColor: "content.link",
                            }}
                          >
                            City
                          </Tab>
                        </TabList>

                        <TabPanels backgroundColor="background.default">
                          <TabPanel
                            display="flex"
                            flexDirection="column"
                            gap="36px"
                            borderRadius="8px"
                          >
                            <Box>
                              <Text
                                color="content.primary"
                                fontWeight="semibold"
                                lineHeight="24"
                                fontSize="title.md"
                                fontFamily="body"
                                fontStyle="normal"
                              >
                                Account Details
                              </Text>
                              <Text
                                color="content.tertiary"
                                fontWeight="normal"
                                lineHeight="24"
                                fontFamily="heading"
                                fontSize="body.lg"
                                letterSpacing="wide"
                                marginTop="8px"
                              >
                                Here you can find and edit all your profile
                                information.
                              </Text>
                            </Box>
                            <Box
                              display="flex"
                              flexDirection="column"
                              gap="24px"
                            >
                              <form
                                onSubmit={handleSubmit(onSubmit)}
                                className="flex flex-col gap-[24px]"
                              >
                                <FormInput
                                  label="Full Name"
                                  register={register}
                                  error={errors.name}
                                  id="name"
                                />
                                <FormInput
                                  label="Email"
                                  isDisabled
                                  register={register}
                                  error={errors.email}
                                  id="email"
                                />
                                <FormInput
                                  label="City or Region"
                                  register={register}
                                  error={errors.city}
                                  id="city"
                                />
                                <FormSelectInput
                                  label="Role"
                                  value={inputValue}
                                  register={register}
                                  error={errors.role}
                                  id="role"
                                  onInputChange={onInputChange}
                                />
                                <Box
                                  display="flex"
                                  w="100%"
                                  justifyContent="right"
                                  marginTop="12px"
                                >
                                  <Button
                                    type="submit"
                                    h="48px"
                                    w="169px"
                                    paddingTop="16px"
                                    paddingBottom="16px"
                                    paddingLeft="24px"
                                    paddingRight="24px"
                                    letterSpacing="widest"
                                    textTransform="uppercase"
                                    fontWeight="semibold"
                                    fontSize="button.md"
                                  >
                                    save changes
                                  </Button>
                                </Box>
                              </form>
                            </Box>
                          </TabPanel>
                          <TabPanel>
                            <p>two!</p>
                          </TabPanel>
                          <TabPanel>
                            <p>three!</p>
                          </TabPanel>
                        </TabPanels>
                      </Tabs>
                    </Box>
                  </Box>
                </TabPanel>
                <TabPanel>
                  <p>two!</p>
                </TabPanel>
                <TabPanel>
                  <p>three!</p>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
