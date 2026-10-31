import React from "react";

import { Card as UiCard } from "@/components/ui/card";
import { cn } from "@lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<Props> = ({ children, className }) => {
  return (
    <UiCard className={cn("w-full gap-0 py-0", className)}>
      <div className="p-4">{children}</div>
    </UiCard>
  );
};
