import React from "react";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  cn,
  formatDateTimeWithDay,
  isTcExamItem,
  toKatakana,
} from "@lib/utils";
import styles from "@styles/daily-order-list.module.css";
import { PatientName } from "@components/react/patient-name";
import { CheckItem } from "@components/react/exam_order/procedure_page/check-item";
import { MlUnderline } from "@components/react/exam_order/procedure_page/ml-underline";
import { MbqUnderline } from "./mbq-underline";
import { FinishTime } from "./finish-time";

interface ProcedureConfig {
  /** 見出し「〇〇の調製手順と記録」の〇〇 */
  title: string;
  /** 手順書や添付文書に基づいた目標量 */
  base_target_amount: string;
  /**
   * 【標識】の工程。省略すると【標識】がない様式（ジェネレータからの溶出液をそのまま分注する）になる。
   */
  labeling?: {
    /** キットバイアル情報の製品名 */
    product_name: string;
    /** 常温戻しの時間 */
    return_time?: string;
    /** 常温戻し時刻と標識終了時刻の間の工程。省略時は標準の工程 */
    steps?: React.ReactNode[];
    /** 標識後静置（・・・(b) が付く） */
    leave?: string;
  };
  /** 【分注】の下に添える注意書き */
  dispense_note?: string;
  /** 【投与準備】の下に添える注意書き */
  prep_note?: string;
}

interface ProcedurePageProps {
  order: ExamOrderWithPatient;
  targetDate: string;
}

/** 目標量を施設で書き込む様式用の空欄 */
const BLANK_TARGET_AMOUNT = "　　～　　MBq / 　～　mL";

/** 標準の標識工程（常温戻し時刻と標識終了時刻の間） */
const DEFAULT_LABELING_STEPS: React.ReactNode[] = [
  <CheckItem>キットバイアルゴム栓の消毒</CheckItem>,
  <CheckItem>内容物の確認</CheckItem>,
  <>
    <CheckItem>未使用注射針筒で(a)をキットバイアルに</CheckItem>
    <div className="grid grid-flow-col justify-start pl-6">
      <MlUnderline />
      <p>追加</p>
    </div>
  </>,
  <CheckItem>振とう</CheckItem>,
  <CheckItem>内容物の溶解と異物・異常着色の確認</CheckItem>,
];

// 標識手順書の様式がある検査項目。
// 放射性医薬品取り扱いガイドライン 第4版（日本核医学会ほか）付録４「各種様式例」の
// 「〇〇の調製手順と記録」をもとにしている。
// ここにない検査は手順書を印刷できない（canPrintProcedureSheet を参照）。
const PROCEDURE_CONFIGS: Record<string, ProcedureConfig> = {
  センチネルリンパ節シンチ: {
    title: "テクネフチン酸キット",
    base_target_amount: "18.5～111 MBq / 2～8 mL",
    labeling: {
      product_name: "テクネフチン酸キット",
      leave: "標識後静置不要",
    },
    prep_note: "標識後できるだけ早く投与",
  },
  骨シンチ: {
    title: "クリアボーンキット",
    base_target_amount: "555～740 MBq / 3～9 mL",
    labeling: {
      product_name: "テクネクリアボーンキット",
      return_time: "5分",
      leave: "標識後静置（室温放置　10分）",
    },
    dispense_note: "調製後は6時間以内に使用すること",
  },
  "腎レノグラム ラシックス負荷": {
    title: "テクネDTPAキット",
    base_target_amount: "74 ～ 555 MBq / 2 ～ 9 mL",
    labeling: {
      product_name: "テクネDTPAキット",
      return_time: "5分",
      leave: "標識後静置（室温放置　2～5分）",
    },
  },
  "腎レノグラム 負荷無": {
    title: "テクネDTPAキット",
    base_target_amount: "74 ～ 555 MBq / 2 ～ 9 mL",
    labeling: {
      product_name: "テクネDTPAキット",
      return_time: "5分",
      leave: "標識後静置（室温放置　2～5分）",
    },
  },
  // 目標量はガイドラインの様式でも空欄（施設で記入する）
  肺血流シンチ: {
    title: "テクネMAAキット",
    base_target_amount: BLANK_TARGET_AMOUNT,
    labeling: {
      product_name: "テクネMAAキット",
      return_time: "10～20分",
      steps: [
        <CheckItem>キットバイアルゴム栓の消毒</CheckItem>,
        <CheckItem>再凍結無等内部の確認</CheckItem>,
        <CheckItem>未使用注射針筒で(a)をキットバイアルに添加</CheckItem>,
        <CheckItem>10～15秒軽く回転振とう</CheckItem>,
        <CheckItem>内容物の溶解と異物・異常着色の確認</CheckItem>,
      ],
      leave: "標識後静置（室温放置　15分）",
    },
  },
  // 過テクネチウム酸ナトリウムをそのまま使うので【標識】はない。目標量は施設で記入する
  "甲状腺シンチ Tcのみ": {
    title: "ジェネレータからの溶出液",
    base_target_amount: BLANK_TARGET_AMOUNT,
  },
};

/** 標識手順書を印刷できる検査か（Tc を使い、手順書の様式があるもの） */
export function canPrintProcedureSheet(examItem: string): boolean {
  return isTcExamItem(examItem) && examItem in PROCEDURE_CONFIGS;
}

export const ProcedurePage: React.FC<ProcedurePageProps> = ({
  order,
  targetDate,
}) => {
  const config = PROCEDURE_CONFIGS[order.exam_item];
  if (!config) return null;
  const labeling = config.labeling;
  // 【標識】がない様式では、分注は (a) から抜き取り (b) とする
  const dispenseFrom = labeling ? "b" : "a";
  const dispensed = labeling ? "c" : "b";

  return (
    <div
      className={cn("grid gap-2", styles.procedure_page)}
      id={`print-target-${order.id}`}
    >
      {/* ヘッダータイトル */}
      <h1 className="text-2xl">{config.title}の調製手順と記録</h1>

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
      {labeling && (
        <div className="grid grid-cols-[auto,1fr] items-start">
          <div>
            <h2>【標識】</h2>
            <ul className="grid gap-1 pl-4">
              <li
                className={cn(
                  labeling.return_time && "grid grid-flow-col justify-start",
                )}
              >
                <CheckItem>常温戻し時刻 (　　：　　)</CheckItem>

                {labeling.return_time && (
                  <p className="text-sm">（戻し時間 {labeling.return_time}）</p>
                )}
              </li>
              {(labeling.steps ?? DEFAULT_LABELING_STEPS).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
              <li>
                <FinishTime>標識終了時刻</FinishTime>
              </li>
              {labeling.leave && (
                <li>
                  <CheckItem>{labeling.leave} ・・・(b)</CheckItem>
                </li>
              )}
            </ul>
          </div>

          <div className="border border-black px-4 py-8 grid gap-2 col-2">
            <h3 className="text-lg">キットバイアル情報</h3>
            <ul>
              <li>製品名　：{labeling.product_name}</li>
              <li>製造番号：</li>
              <li>有効期限：</li>
            </ul>
          </div>
        </div>
      )}

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
            <CheckItem>({dispenseFrom})から抜き取った標識薬</CheckItem>
            <div className="grid grid-flow-col gap-8 justify-start">
              <MbqUnderline />
              <MlUnderline mark={dispensed} />
            </div>
          </li>
          <li>
            <FinishTime>分注終了時刻</FinishTime>
          </li>
          {config.dispense_note && (
            <li className="border-b border-black justify-self-start pl-4 pr-4">
              {config.dispense_note}
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
              <CheckItem>
                誤投与防止対策（注射筒({dispensed})へのラベル貼付）
              </CheckItem>
            </li>
            <li>
              <CheckItem>貯蔵（保管）箱内にて整頓と保管</CheckItem>
            </li>
            <li>
              <FinishTime>調製終了時刻</FinishTime>
            </li>
            {config.prep_note && (
              <li className="border-b border-black justify-self-start pl-4 pr-4">
                {config.prep_note}
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
