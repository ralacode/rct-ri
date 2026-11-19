import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { fetchMe, type AuthUser } from "@/lib/auth";
import { hasAccess, type Access } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ACTIONS: readonly {
  label: string;
  href: string;
  access?: Access;
  primary?: boolean;
}[] = [
  {
    label: "患者登録",
    href: "/patient/register/",
    access: "patients",
    primary: true,
  },
  { label: "検査一覧", href: "/exam_order/daily-list/", access: "ri" },
  { label: "治療依頼表", href: "/treatment/", access: "radiotherapy" },
  { label: "質問・要望", href: "/feedback/" },
];

/** ホームのボタン。担当モダリティで使えるページだけを出す。 */
export function HomeActions() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (!user) return <div className="h-11" aria-hidden />;

  const actions = ACTIONS.filter((action) => hasAccess(user, action.access));
  // 患者登録が出ないときは、最初のボタンを強調する。
  const primaryHref =
    actions.find((action) => action.primary)?.href ?? actions[0]?.href;

  return (
    <div className="grid gap-2 @lg:grid-flow-col">
      {actions.map((action) => (
        <a
          key={action.href}
          href={action.href}
          className={cn(
            buttonVariants({
              variant: action.href === primaryHref ? "default" : "outline",
              size: "lg",
            }),
            "text-base",
            action.href !== primaryHref && "border-2 border-foreground/45",
          )}
        >
          {action.label}
        </a>
      ))}
    </div>
  );
}
