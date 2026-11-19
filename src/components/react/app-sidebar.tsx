import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, LogOut, Search, Users } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  guardSidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AuthUser } from "@/lib/auth";
import { siteMeta } from "@/lib/constants";
import { go } from "@/lib/nav";
import {
  isCurrentPath,
  matchesMenuQuery,
  menuGroups,
  menuItems,
  type MenuGroupId,
  type MenuItem,
} from "@/lib/sidebar-menu";
import { hasAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function groupOfPath(
  items: readonly MenuItem[],
  path: string,
): MenuGroupId | undefined {
  return items.find((item) => isCurrentPath(path, item.href, item.exact))
    ?.group;
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
  const { isMobile, setOpenMobile, state, setOpen } = useSidebar();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = menuGroups;
  // 担当モダリティで使えない項目は最初から出さない（グループが空になれば見出しも出ない）。
  const items = useMemo(
    () => menuItems.filter((item) => hasAccess(user, item.access)),
    [user],
  );

  // 小さいウインドウ（モバイル表示）ではグループを開閉できる。
  // 初期状態は現在のページが属するグループだけを開く。
  const [openGroups, setOpenGroups] = useState<Set<MenuGroupId>>(
    () => new Set([groupOfPath(items, currentPath) ?? "common"]),
  );
  useEffect(() => {
    const group = groupOfPath(items, currentPath);
    if (!group) return;
    setOpenGroups((prev) => (prev.has(group) ? prev : new Set(prev).add(group)));
  }, [items, currentPath]);

  const toggleGroup = (id: MenuGroupId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searching = query.trim() !== "";

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: items.filter(
            (item) =>
              item.group === group.id &&
              (!item.adminOnly || user?.canManageUsers) &&
              matchesMenuQuery(item, query),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [groups, items, query, user?.canManageUsers],
  );
  const firstResult = visibleGroups[0]?.items[0];

  const navigateTo = (href: string) => {
    setQuery("");
    if (isMobile) {
      guardSidebarTrigger();
      setOpenMobile(false);
    }
    go(href);
  };

  const handleNav = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (!isMobile) {
      setQuery("");
      return;
    }
    event.preventDefault();
    navigateTo(href);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      if (!searching || !firstResult) return;
      event.preventDefault();
      navigateTo(firstResult.href);
    }
  };

  const openSearch = () => {
    setOpen(true);
    // サイドバーが展開されてから入力欄にフォーカスする
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const collapsibleGroups = isMobile && !searching;

  return (
    <div className="contents [grid-area:sidebar] print:hidden">
      <Sidebar collapsible="icon" className="print:hidden">
        <SidebarHeader className="border-b border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={siteMeta.siteTitle}>
                <a href="/" onClick={(event) => handleNav(event, "/")}>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                    RCT
                  </span>
                  <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
                    {siteMeta.siteTitle}
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {state === "collapsed" && !isMobile && (
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="メニューを検索" onClick={openSearch}>
                  <Search />
                  <span>メニューを検索</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
          <div className="relative group-data-[collapsible=icon]:hidden">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <SidebarInput
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="メニューを検索"
              aria-label="メニューを検索"
              className="pl-8"
            />
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0">
          {visibleGroups.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              該当するメニューがありません
            </p>
          )}
          {visibleGroups.map((group, index) => {
            const expanded = !collapsibleGroups || openGroups.has(group.id);
            const contentId = `sidebar-group-${group.id}`;
            return (
              <div key={group.id}>
                {index > 0 && <SidebarSeparator />}
                <SidebarGroup>
                  {collapsibleGroups ? (
                    <SidebarGroupLabel asChild>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={expanded}
                        aria-controls={contentId}
                        className="w-full justify-between hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        {group.label}
                        <ChevronRight
                          className={cn(
                            "transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                    </SidebarGroupLabel>
                  ) : (
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  )}
                  {expanded && (
                    <SidebarGroupContent id={contentId}>
                      <SidebarMenu>
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              isActive={isCurrentPath(
                                currentPath,
                                item.href,
                                item.exact,
                              )}
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
                  )}
                </SidebarGroup>
              </div>
            );
          })}
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
