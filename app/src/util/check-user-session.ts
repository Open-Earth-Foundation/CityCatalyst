import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export const CheckUserSession = () => {
  const router = useRouter();

  const { data, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/auth/login");
    },
  });

  console.log("user session", data);
};
