// src/components/react/home-actions.tsx
//
// ホーム画面。あいさつと、よく使うページへの入口（担当モダリティで使えるものだけ）。

import { useEffect, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FilmIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMe, type AuthUser } from "@/lib/auth";
import { hasAccess, type Access } from "@/lib/permissions";
import { formatDateTimeWithDay, getTodayLocalString } from "@/lib/utils";
import { PageContainer } from "@components/react/layout/page-header";

const ACTIONS: readonly {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  access?: Access;
}[] = [
  {
    label: "検査一覧",
    description: "今日の RI 検査と投与記録",
    href: "/exam_order/daily-list/",
    icon: ClipboardListIcon,
    access: "ri",
  },
  {
    label: "治療依頼表",
    description: "放射線治療の枠と依頼",
    href: "/treatment/",
    icon: CalendarDaysIcon,
    access: "radiotherapy",
  },
  {
    label: "患者登録",
    description: "新しい患者を登録する",
    href: "/patient/register/",
    icon: UserPlusIcon,
    access: "patients",
  },
  {
    label: "患者検索",
    description: "ID や氏名で患者を探す",
    href: "/patient/search/",
    icon: SearchIcon,
    access: "patients",
  },
  {
    label: "動画",
    description: "研修・手順の動画",
    href: "/videos/",
    icon: FilmIcon,
  },
  {
    label: "質問・要望",
    description: "RIS について質問・要望を送る",
    href: "/feedback/",
    icon: MessageCircleQuestionIcon,
  },
];

function greeting(hour: number) {
  if (hour < 10) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "おつかれさまです";
}

/** ホームのあいさつと入口。担当モダリティで使えるページだけを出す。 */
export function HomeActions() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(new Date().getHours());
    void fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const actions = user
    ? ACTIONS.filter((action) => hasAccess(user, action.access))
    : [];

  return (
    <PageContainer className="max-w-3xl content-start pt-10 md:pt-16">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatDateTimeWithDay(getTodayLocalString())}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {hour === null ? " " : greeting(hour)}
          {user && `、${user.lastName}さん`}
        </h1>
        <p className="text-muted-foreground">今日もよろしくお願いします。</p>
      </header>

      {user ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <li key={action.href}>
              <a
                href={action.href}
                className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="flex-row items-center gap-4 px-4 py-4 transition-colors group-hover:bg-muted/50">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <action.icon className="size-5" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-medium">{action.label}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
