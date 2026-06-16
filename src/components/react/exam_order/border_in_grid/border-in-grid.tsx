import React, { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
}

export const BorderInGrid: React.FC<Props> = ({ children, className }) => {
  return (
    <div className={cn("border-b border-r border-black", className)}>
      {children}
    </div>
  );
};
