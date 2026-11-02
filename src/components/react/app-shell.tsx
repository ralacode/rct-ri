import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/react/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  fetchAuthStatus,
  logout,
  redirectForAuthStatus,
  type AuthUser,
} from "@/lib/auth";
import { siteMeta } from "@/lib/constants";
import { startLiveUpdates } from "@/lib/live";
import { go } from "@/lib/nav";

export function AppShell({
  currentPath = "",
  defaultOpen = true,
}: {
  currentPath?: string;
  defaultOpen?: boolean;
}) {
  const [path, setPath] = useState(currentPath);
  const [open, setOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

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
        const ok = await redirectForAuthStatus(status);
        if (cancelled) return;
        if (ok && status.user) {
          setUser(status.user);
          startLiveUpdates();
        }
      } catch {
        if (!cancelled) go("/login/");
      }
    };
    void syncAuth();
    document.addEventListener("astro:page-load", syncAuth);
    return () => {
      cancelled = true;
      document.removeEventListener("astro:page-load", syncAuth);
    };
  }, []);

  const handleLogout = async () => {
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
      <AppSidebar currentPath={path} user={user} onLogout={() => void handleLogout()} />
      <header className="flex h-12 items-center gap-2 border-b px-2 [grid-area:header] print:hidden">
        <SidebarTrigger />
        <a href="/" className="truncate font-bold">
          {siteMeta.siteTitle}
        </a>
        {user && (
          <span className="ml-auto truncate text-sm text-muted-foreground">
            {user.displayName}
          </span>
        )}
      </header>
    </SidebarProvider>
  );
}
