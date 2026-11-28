// src/components/react/theme/theme-toggle.tsx

import { useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    setThemeState(getTheme());
    return onThemeChange(() => setThemeState(getTheme()));
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="表示テーマを切り替える"
        >
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>表示テーマ</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          <DropdownMenuRadioItem value="light">
            <SunIcon />
            ライト
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon />
            ダーク
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon />
            端末の設定に合わせる
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
