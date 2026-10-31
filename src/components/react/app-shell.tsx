import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/react/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { siteMeta } from "@/lib/constants";

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

  return (
    <SidebarProvider
      className="contents"
      open={open}
      onOpenChange={setOpen}
      openMobile={openMobile}
      onOpenMobileChange={setOpenMobile}
    >
      <AppSidebar currentPath={path} />
      <header className="flex h-12 items-center gap-2 border-b px-2 [grid-area:header] print:hidden">
        <SidebarTrigger />
        <a href="/" className="truncate font-bold">
          {siteMeta.siteTitle}
        </a>
      </header>
    </SidebarProvider>
  );
}
