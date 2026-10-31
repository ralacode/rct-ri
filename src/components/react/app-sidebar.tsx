import {
  ClipboardList,
  Contact,
  ContactRound,
  Home,
  Search,
  TrendingDown,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
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

export function AppSidebar({ currentPath }: { currentPath: string }) {
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    </div>
  );
}
