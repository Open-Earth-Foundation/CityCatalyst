import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export const CheckUserSession = () => {
  const router = useRouter();

  useSession({
    required: true,
    onUnauthenticated() {
      router.push("/auth/login");
    },
  });
};
