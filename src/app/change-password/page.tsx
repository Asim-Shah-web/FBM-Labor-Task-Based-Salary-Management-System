import { requireUser } from "@/server/authz/require";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <ChangePasswordForm forced={user.mustChangePassword} />
    </div>
  );
}
