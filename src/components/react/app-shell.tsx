import { useEffect, useLayoutEffect, useState } from "react";

import { AppSidebar } from "@/components/react/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  exitNurseMode,
  fetchAuthStatus,
  isNurseMode,
  loginUrl,
  logout,
  redirectForAuthStatus,
  watchSession,
  type AuthUser,
  type Viewer,
} from "@/lib/auth";
import { siteMeta } from "@/lib/constants";
import { startLiveUpdates } from "@/lib/live";
import { go } from "@/lib/nav";
import type { GuideLink } from "@/lib/sidebar-menu";

export function AppShell({
  currentPath = "",
  defaultOpen = true,
  guides = [],
}: {
  currentPath?: string;
  defaultOpen?: boolean;
  guides?: GuideLink[];
}) {
  const [path, setPath] = useState(currentPath);
  const [open, setOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  // 看護師モードは Cookie で分かるので、職員用メニューが一瞬見えないよう描画前に切り替える。
  useLayoutEffect(() => {
    if (isNurseMode()) setViewer("nurse");
  }, []);

  useEffect(() => {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("sidebar_state="));
    if (match) {
      setOpen(match.split("=")[1] !== "false");
    }
  }, []);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    sync();
    document.addEventListener("astro:page-load", sync);
    return () => document.removeEventListener("astro:page-load", sync);
  }, []);

  useEffect(() => {
    const tauri = window.__TAURI__;
    if (!tauri?.window?.getCurrentWindow) return;
    void tauri.window.getCurrentWindow().setTitle(document.title);
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    const syncAuth = async () => {
      try {
        const status = await fetchAuthStatus();
        if (cancelled) return;
        const result = await redirectForAuthStatus(status);
        if (cancelled || !result) return;
        setViewer(result);
        if (result === "staff" && status.user) {
          setUser(status.user);
          startLiveUpdates();
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) go(loginUrl());
      }
    };
    void syncAuth();
    document.addEventListener("astro:page-load", syncAuth);
    return () => {
      cancelled = true;
      document.removeEventListener("astro:page-load", syncAuth);
    };
  }, []);

  useEffect(() => watchSession(), []);

  const nurse = viewer === "nurse";
  const homeHref = nurse ? "/guide/" : "/";

  const handleLogout = async () => {
    if (nurse) {
      exitNurseMode();
      go("/login/");
      return;
    }
    try {
      await logout();
    } finally {
      go("/login/");
    }
  };

  return (
    <SidebarProvider
      className="contents"
      open={open}
      onOpenChange={setOpen}
      openMobile={openMobile}
      onOpenMobileChange={setOpenMobile}
    >
      <AppSidebar
        currentPath={path}
        user={user}
        nurse={nurse}
        guides={guides}
        homeHref={homeHref}
        onLogout={() => void handleLogout()}
      />
      <header className="flex h-12 items-center gap-2 border-b px-2 [grid-area:header] print:hidden">
        <SidebarTrigger />
        <a href={homeHref} className="truncate font-bold">
          {siteMeta.siteTitle}
        </a>
        {(user || nurse) && (
          <span className="ml-auto truncate text-sm text-muted-foreground">
            {nurse ? "看護師" : user?.displayName}
          </span>
        )}
      </header>
    </SidebarProvider>
  );
}
