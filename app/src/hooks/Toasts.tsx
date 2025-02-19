import { toaster } from "@/components/ui/toaster";

export function UseSuccessToast(props: {
  title: string;
  description: string;
  text: string;
}) {
  const { title, description, text } = props;
  const showSuccessToast = () => {
    return toaster.success({
      title,
      description,
      duration: 3000,
      placement: "top",
    });
  };

  return { showSuccessToast };
}

export function UseErrorToast(props: {
  title: string;
  description: string;
  text: string;
}) {
  const { title, description, text } = props;
  const showErrorToast = () => {
    return toaster.error({
      title,
      description,
      duration: 6000,
      placement: "top",
    });
  };

  return { showErrorToast };
}
