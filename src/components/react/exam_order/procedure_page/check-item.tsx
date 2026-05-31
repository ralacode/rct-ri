import React from "react";

interface CheckItemProps {
  children: React.ReactNode;
}

export const CheckItem: React.FC<CheckItemProps> = ({ children }) => {
  return (
    <div className="grid grid-flow-col gap-2 justify-start items-center">
      <span className="w-3.5 h-3.5 border border-black"></span>
      <span>{children}</span>
    </div>
  );
};
