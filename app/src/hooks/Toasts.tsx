import { toaster } from "@/components/ui/toaster";

export function UseSuccessToast({
  title,
  description,
  duration = 3000,
}: {
  title: string;
  description?: string;
  duration?: number;
}) {
  const showSuccessToast = (data?: { title: string; description?: string }) => {
    return toaster.create({
      title: data?.title ?? title,
      description: data?.description ?? description,
      type: "success",
      duration: duration,
    });
  };

  return { showSuccessToast };
}

export function UseErrorToast({
  title,
  description,
  duration = 6000,
}: {
  title: string;
  description?: string;
  duration?: number;
}) {
  const showErrorToast = (data?: { title: string; description?: string }) => {
    return toaster.create({
      title: data?.title ?? title,
      description: data?.description ?? description,
      duration,
      type: "error",
    });
  };

  return { showErrorToast };
}
