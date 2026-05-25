import React from "react";

interface MlUnderlineProps {
  mark?: string;
}

export const MlUnderline: React.FC<MlUnderlineProps> = ({ mark }) => {
  return (
    <div className="grid grid-flow-col justify-start">
      <div className="border-b-2 border-black w-16"></div>
      <p>mL {mark && `・・・(${mark})`}</p>
    </div>
  );
};
