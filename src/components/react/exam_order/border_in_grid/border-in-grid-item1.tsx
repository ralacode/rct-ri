import { cn } from "@/lib/utils";
import { type FC, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export const BorderInGridItem1: FC<Props> = ({ children, className }) => {
  return (
    <div className={cn("border-b border-black pl-2", className)}>
      {children}
    </div>
  );
};
