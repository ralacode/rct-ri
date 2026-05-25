import React from "react";

interface FinishTimeProps {
  children: React.ReactNode;
}

export const FinishTime: React.FC<FinishTimeProps> = ({ children }) => {
  return <p className="font-bold">（{children}　　　:　　　）</p>;
};
