import {
  ClipboardList,
  Contact,
  ContactRound,
  Home,
  KeyRound,
  LogOut,
  Search,
  TrendingDown,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  guardSidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AuthUser } from "@/lib/auth";
import { siteMeta } from "@/lib/constants";
import { go } from "@/lib/nav";

const menuItems = [
  { name: "ホーム", href: "/", icon: Home },
  { name: "検査一覧", href: "/exam_order/daily-list/", icon: ClipboardList },
  { name: "患者登録", href: "/patient/register/", icon: ContactRound },
  { name: "患者一覧", href: "/patient/list/", icon: Contact },
  { name: "患者検索", href: "/patient/search/", icon: Search },
  { name: "減衰計算", href: "/mo99-decay/", icon: TrendingDown },
] as const;

function isCurrentPath(path: string | undefined, href: string) {
  if (!path) return false;
  return path === href || (href !== "/" && path.startsWith(href));
}

export function AppSidebar({
  currentPath,
  user,
  onLogout,
}: {
  currentPath: string;
  user: AuthUser | null;
  onLogout: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNav = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (!isMobile) return;
    event.preventDefault();
    guardSidebarTrigger();
    setOpenMobile(false);
    go(href);
  };

  return (
    <div className="contents [grid-area:sidebar] print:hidden">
      <Sidebar collapsible="icon" className="print:hidden">
        <SidebarHeader className="border-b border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={siteMeta.siteTitle}>
                <a href="/" onClick={(event) => handleNav(event, "/")}>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                    RI
                  </span>
                  <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
                    {siteMeta.siteTitle}
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isCurrentPath(currentPath, item.href)}
                      tooltip={item.name}
                    >
                      <a
                        href={item.href}
                        onClick={(event) => handleNav(event, item.href)}
                      >
                        <item.icon />
                        <span>{item.name}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {user?.canManageUsers && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isCurrentPath(currentPath, "/users/")}
                      tooltip="担当者管理"
                    >
                      <a
                        href="/users/"
                        onClick={(event) => handleNav(event, "/users/")}
                      >
                        <Users />
                        <span>担当者管理</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isCurrentPath(currentPath, "/account/")}
                    tooltip="パスワード変更"
                  >
                    <a
                      href="/account/"
                      onClick={(event) => handleNav(event, "/account/")}
                    >
                      <KeyRound />
                      <span>パスワード変更</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            {user && (
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={user.displayName}>
                  <Users />
                  <span className="truncate">{user.displayName}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="ログアウト" onClick={onLogout}>
                <LogOut />
                <span>ログアウト</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </div>
  );
}
