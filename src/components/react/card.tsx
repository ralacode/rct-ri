import React from "react";
import { cn } from "@lib/utils";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<Props> = ({ children, className }) => {
  return (
    <div className={cn("p-4 shadow-(--box-shadow) rounded-md", className)}>
      {children}
    </div>
  );
};
