import React from "react";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  cn,
  formatDateTimeWithDay,
  toKatakana,
} from "@lib/utils";
import styles from "@styles/daily-order-list.module.css";
import { PatientName } from "@components/react/patient-name";
import { CheckItem } from "@components/react/exam_order/procedure_page/check-item";
import { MlUnderline } from "@components/react/exam_order/procedure_page/ml-underline";
import { MbqUnderline } from "./mbq-underline";
import { FinishTime } from "./finish-time";

interface ProcedureConfig {
  kit_name: string;
  base_target_amount: string;
  return_time?: string;
  leave?: string;
}

interface ProcedurePageProps {
  order: ExamOrderWithPatient;
  targetDate: string;
}

const PROCEDURE_CONFIGS: Record<string, ProcedureConfig> = {
  センチネルリンパ節シンチ: {
    kit_name: "テクネフチン酸キット",
    base_target_amount: "18.5～111 MBq / 2～8 mL",
    leave: "標識後静置不要",
  },
  骨シンチ: {
    kit_name: "クリアボーンキット",
    base_target_amount: "555～740 MBq / 3～9 mL",
    return_time: "5分",
    leave: "標識後静置（室温放置　10分）",
  },
  "腎レノグラム ラシックス負荷": {
    kit_name: "テクネDTPAキット",
    base_target_amount: "74 ～ 555 MBq / 2 ～ 9 mL",
    return_time: "5分",
    leave: "標識後静置（室温放置　2～5分）",
  },
};

export const ProcedurePage: React.FC<ProcedurePageProps> = ({
  order,
  targetDate,
}) => {
  // 該当する検査項目の設定を取得（未定義の場合はデフォルト表示）
  const config = PROCEDURE_CONFIGS[order.exam_item] || {
    title: "標識手順書",
  };

  return (
    <div
      className={cn("grid gap-2", styles.procedure_page)}
      id={`print-target-${order.id}`}
    >
      {/* ヘッダータイトル */}
      <h1 className="text-2xl">{config.kit_name}の調製手順と記録</h1>

      {/* 調製日 */}
      <p className="justify-self-end">
        調整日：{formatDateTimeWithDay(targetDate)}
      </p>

      {/* 患者基本情報 */}
      <div className="grid grid-flow-col gap-16 justify-start">
        <div>
          <p>{order.patient_id}</p>
          <p>
            <PatientName
              last_name_kanji={order.last_name_kanji}
              last_name_kana={toKatakana(order.last_name_kana)}
              first_name_kanji={order.first_name_kanji}
              first_name_kana={toKatakana(order.first_name_kana)}
            />
          </p>
        </div>
        <div className="grid content-between">
          <p>{order.exam_item}</p>
          <div className={cn("grid grid-flow-col gap-4 justify-start")}>
            <p>{calculateAge(order.birth_date)} 歳</p>
            <p>{order.gender}性</p>
            {order.weight ? (
              <p>{order.weight} kg</p>
            ) : (
              <div
                className={cn(
                  "grid grid-cols-[3rem_auto] gap-2 grid-flow-col justify-start",
                )}
              >
                <span className="border-b-2 border-black"></span>
                <span>kg</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ジェネレータから溶出 */}
      <div className="grid grid-flow-col justify-between items-start">
        <div>
          <h2>【ジェネレータから溶出】</h2>
          <div className="pl-4">
            <p className="text-sm">
              ジェネレータ情報は「ジェネレータ溶出記録」参照
            </p>
            <ul className="grid gap-1">
              <li className="grid grid-flow-col gap-4 justify-start">
                <CheckItem>溶出通番</CheckItem>
                <div className="border-b-2 border-black w-32"></div>
              </li>
              <li>
                <CheckItem>針の交換</CheckItem>
              </li>
              <li>
                <CheckItem>溶出バイアルのゴム栓の消毒</CheckItem>
              </li>
              <li className="grid grid-flow-col gap-8 justify-start">
                <CheckItem>溶出量</CheckItem>
                <MbqUnderline />
                <MlUnderline />
              </li>
              <li className="grid grid-flow-col gap-4 justify-start">
                <CheckItem>溶出時刻</CheckItem>
                <div className="border-b-2 border-black w-32 text-center">
                  :
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-gray-200 px-3 pb-3">
          <h3 className="text-lg">【テクネチウム注射液】</h3>
          <div className="border border-black bg-white pt-2 pl-3 pr-10 pb-3 grid content-between">
            <p className="text-sm">テクネシンチまたはテクネゾール</p>
            <p>製造番号：</p>
            <p>放射能　：</p>
            <p>検定日時：</p>
          </div>
        </div>
      </div>

      {/* 希釈・濃度調整 */}
      <div>
        <div className="grid grid-flow-col justify-start items-end">
          <h2>【希釈・濃度調整】</h2>

          <p>
            （手順書や添付文書に基づいた目標量　{config.base_target_amount}）
          </p>
        </div>
        <ul className="grid gap-1 pl-4">
          <li>
            <CheckItem>（溶出）バイアルのゴム栓の消毒</CheckItem>
          </li>
          <li className="grid grid-flow-col gap-8 justify-start">
            <CheckItem>（溶出）バイアルからの抜き取り量</CheckItem>
            <MbqUnderline />
            <MlUnderline />
          </li>
          <li className="grid grid-flow-col gap-44 justify-start">
            <CheckItem>
              <span>希釈・濃度調整に用いる生理食塩液量</span>{" "}
            </CheckItem>
            <MlUnderline />
          </li>
          <li className="grid grid-flow-col gap-24 justify-start">
            <CheckItem>調整済テクネチウム溶液量</CheckItem>
            <div className="grid gap gap-8 grid-flow-col justify-start">
              <MbqUnderline />
              <MlUnderline mark="a" />
            </div>
          </li>
          <li>
            <FinishTime>希釈・濃度調整終了時刻</FinishTime>
          </li>
        </ul>
      </div>

      {/* 標識 */}
      <div className="grid grid-cols-[auto,1fr] items-start">
        <div>
          <h2>【標識】</h2>
          <ul className="grid gap-1 pl-4">
            <li
              className={cn(
                config.return_time && "grid grid-flow-col justify-start",
              )}
            >
              <CheckItem>常温戻し時刻 (　　：　　)</CheckItem>

              {config.return_time && (
                <p className="text-sm">（戻し時間 {config.return_time}）</p>
              )}
            </li>
            <li>
              <CheckItem>キットバイアルゴム栓の消毒</CheckItem>
            </li>
            <li>
              <CheckItem>内容物の確認</CheckItem>
            </li>
            <li>
              <CheckItem>未使用注射針筒で(a)をキットバイアルに</CheckItem>
              <div className="grid grid-flow-col justify-start pl-6">
                <MlUnderline />
                <p>追加</p>
              </div>
            </li>
            <li>
              <CheckItem>振とう</CheckItem>
            </li>
            <li>
              <CheckItem>内容物の溶解と異物・異常着色の確認</CheckItem>
            </li>
            <li>
              <FinishTime>標識終了時刻</FinishTime>
            </li>
            {config.leave && (
              <li>
                <CheckItem>{config.leave} ・・・(b)</CheckItem>
              </li>
            )}
          </ul>
        </div>

        <div className="border border-black px-4 py-8 grid gap-2 col-2">
          <h3 className="text-lg">キットバイアル情報</h3>
          <ul>
            <li>
              製品名　：{order.exam_item === "骨シンチ" && "テクネ"}
              {config.kit_name}
            </li>
            <li>製造番号：</li>
            <li>有効期限：</li>
          </ul>
        </div>
      </div>

      {/* 分注 */}
      <div>
        <div className="grid grid-flow-col justify-start items-end">
          <h2>【分注】</h2>
          <p>　　(目標：　　　　MBq)</p>
        </div>
        <ul className="grid gap-1 pl-4">
          <li>
            <CheckItem>未使用の注射針、注射筒を用意する</CheckItem>
          </li>
          <li className="grid grid-flow-col gap-28 justify-start">
            <CheckItem>(b)から抜き取った標識薬</CheckItem>
            <div className="grid grid-flow-col gap-8 justify-start">
              <MbqUnderline />
              <MlUnderline mark="c" />
            </div>
          </li>
          <li>
            <FinishTime>分注終了時刻</FinishTime>
          </li>
          {order.exam_item === "骨シンチ" && (
            <li className="border-b border-black justify-self-start pl-4 pr-4">
              調製後は6時間以内に使用すること
            </li>
          )}
        </ul>
      </div>

      {/* 投与準備 */}
      <div className="grid grid-flow-col justify-between items-end">
        {/* 投与準備（左側） */}
        <div>
          <h2>【投与準備】</h2>
          <ul className="grid gap-1 pl-4">
            <li>
              <CheckItem>誤投与防止対策（注射筒(c)へのラベル貼付）</CheckItem>
            </li>
            <li>
              <CheckItem>貯蔵（保管）箱内にて整頓と保管</CheckItem>
            </li>
            <li>
              <FinishTime>調製終了時刻</FinishTime>
            </li>
            {order.exam_item === "センチネルリンパ節シンチ" && (
              <li className="border-b border-black justify-self-start pl-4 pr-4">
                標識後できるだけ早く投与
              </li>
            )}
          </ul>
        </div>

        {/* 投与準備（右側） */}
        <div className="grid grid-cols-[repeat(3,80px)] gap-6 text-center">
          <div className="border border-black">
            <p className="border-b border-black text-sm">調製担当者</p>
            <div className="h-16"></div>
          </div>
          <div className="border border-black">
            <p className="border-b border-black text-sm">施用者</p>
            <div className="h-16"></div>
          </div>
          <div className="border border-black">
            <p className="border-b border-black text-sm">管理者</p>
            <div className="h-16"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
