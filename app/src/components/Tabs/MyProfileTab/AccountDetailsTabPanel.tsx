import { FC, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { ProfileInputs } from "@/app/[lng]/[inventory]/settings/page";
import FormInput from "../../form-input";
import EmailInput from "../../email-input";
import FormSelectInput from "../../form-select-input";
import { useSetCurrentUserDataMutation } from "@/services/api";
import { TFunction } from "i18next";
import { toaster } from "@/components/ui/toaster";

interface AccountDetailsFormProps {
  t: TFunction;
  userInfo: any;
}

const AccountDetailsTabPanel: FC<AccountDetailsFormProps> = ({
  t,
  userInfo,
}) => {
  const [inputValue, setInputValue] = useState<string>("");
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInputs>();
  const [setCurrentUserData] = useSetCurrentUserDataMutation();

  const onSubmit: SubmitHandler<ProfileInputs> = async (data) => {
    await setCurrentUserData({
      userId: userInfo.userId,
      name: data.name,
      email: data.email,
      role: data.role,
    }).then(() =>
      toaster.success({
        description: t("user-details-updated"),
        duration: 5000,
      }),
    );
  };

  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };

  return (
    <Box display="flex" flexDirection="column" gap="24px">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-[24px]"
      >
        <FormInput
          label={t("full-name")}
          register={register}
          error={errors.name}
          id="name"
        />
        <EmailInput
          disabled
          t={t}
          register={register}
          error={errors.email}
          id="email"
        />
        <FormSelectInput
          label={t("role")}
          value={inputValue}
          register={register}
          error={errors.role}
          id="role"
          onInputChange={onInputChange}
        />
        <Box display="flex" w="100%" justifyContent="right" marginTop="12px">
          <Button
            type="submit"
            loading={isSubmitting}
            h="48px"
            w="auto"
            paddingTop="16px"
            paddingBottom="16px"
            px="24px"
            letterSpacing="widest"
            textTransform="uppercase"
            fontWeight="semibold"
            fontSize="button.md"
          >
            {t("save-changes")}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default AccountDetailsTabPanel;
