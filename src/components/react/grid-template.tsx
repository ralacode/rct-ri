// components/ui/grid.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface GridProps extends React.ComponentProps<"div"> {
  rows?: string;
  cols?: string;
  areas?: string;
}

export function GridTemplate({
  className,
  rows,
  cols,
  areas,
  style,
  ...props
}: GridProps) {
  return (
    <div
      className={cn("grid", className)}
      style={{
        gridTemplateRows: rows,
        gridTemplateColumns: cols,
        gridTemplateAreas: areas,
        ...style,
      }}
      {...props}
    />
  );
}

interface GridItemProps extends React.ComponentProps<"div"> {
  area?: string;
}

export function GridTemplateItem({
  className,
  area,
  style,
  ...props
}: GridItemProps) {
  return (
    <div
      className={className}
      style={{ gridArea: area, ...style }}
      {...props}
    />
  );
}
