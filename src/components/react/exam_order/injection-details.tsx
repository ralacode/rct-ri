import { cn } from "@/lib/utils";
import type { FC, ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export const InjectionDetails: FC<Props> = ({ children, className }) => {
  return (
    <div
      className={cn(
        "bg-gray-200 p-2 rounded-md grid",
        "lg:min-w-48 lg:max-w-50",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const InjectionDetailsContent: FC<Props> = ({ children, className }) => {
  return (
    <div
      className={cn(
        "grid justify-items-end",
        "md:grid-flow-col md:gap-6 md:justify-end",

        className,
      )}
    >
      {children}
    </div>
  );
};
