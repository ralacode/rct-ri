// src/components/react/fade-in.tsx
import React, { useEffect, useState } from "react";
import { cn } from "@lib/utils";

type SupportedElements = "div" | "p" | "span" | "tr" | "td" | "section";

interface FadeInProps<T extends SupportedElements = "div"> {
  as?: T; // 使うときに指定するタグ名（未指定なら "div"）
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const FadeIn = <T extends SupportedElements = "div">({
  as,
  children,
  className,
  delay = 10,
  ...props
}: FadeInProps<T> &
  Omit<React.ComponentPropsWithoutRef<T>, keyof FadeInProps<T>>) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // 画面にこのコンポーネントが登場した瞬間に、指定時間だけ待ってフラグをtrueにする
    const timer = setTimeout(() => setIsMounted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const Tag = (as || "div") as React.ElementType;

  return (
    <Tag
      className={cn(
        "w-full transition-all duration-800 ease-out transform",
        isMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        className,
      )}
      {...props} // これでエラーを起こさずに、全てのPropsを後ろのタグに流せます
    >
      {children}
    </Tag>
  );
};
