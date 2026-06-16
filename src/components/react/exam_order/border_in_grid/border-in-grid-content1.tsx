import { cn } from "@/lib/utils";
import type { FC, ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export const BorderInGridContent1: FC<Props> = ({ children, className }) => {
  return <div className={cn("pt-2 pl-2", className)}>{children}</div>;
};
