import React from "react";

export const Temp = () => {
  return (
    <div className={styles.procedure_for_print}>
      {orders.map((order) => (
        <div
          key={`proc-${order.id}`}
          className={`${styles.procedure_page} grid gap-2`}
          id={`print-target-${order.id}`}
        >
          {order.exam_item === "センチネルリンパ節シンチ" ? (
            <h1 className="text-2xl">テクネフチン酸キットの調整手順と記録</h1>
          ) : (
            <h1>標識手順書</h1>
          )}

          {/* 調整日 */}
          <p className="justify-self-end">
            調整日：{formatDateTimeWithDay(targetDate)}
          </p>

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

            <div style={{ display: "grid", alignContent: "space-between" }}>
              <p>{order.exam_item}</p>

              <div className={styles.p_patient_year}>
                <p>{calculateAge(order.birth_date)} 歳</p>
                <p>{order.gender}性</p>
                {order.weight ? (
                  <p>{order.weight} kg</p>
                ) : (
                  <div className={styles.white_space_weight}>
                    <span style={{ borderBottom: "solid 2px black" }}></span>
                    <span>kg</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ジェネレータから溶出 */}
          <div className="grid grid-flow-col justify-between">
            <div>
              <h2>【ジェネレータから溶出】</h2>
              <div className="pl-4">
                <p className="text-sm">
                  ジェネレータ情報は「ジェネレータ溶出記録」参照
                </p>
                <ul className="grid gap-1">
                  <li className="grid grid-flow-col gap-4 justify-start">
                    <p className="grid grid-flow-col gap-2">
                      <span>□</span>
                      <span>溶出通番</span>
                    </p>
                    <div className="border-b-2 border-black w-32"></div>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>針の交換</span>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>溶出バイアルのゴム栓の消毒</span>
                  </li>
                  <li className="grid grid-flow-col gap-8 justify-start">
                    <p className="grid grid-flow-col gap-2">
                      <span>□</span>
                      <span>溶出量</span>
                    </p>
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-24"></div>
                      <p>MBq</p>
                    </div>
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-16"></div>
                      <p>mL</p>
                    </div>
                  </li>
                  <li className="grid grid-flow-col gap-4 justify-start">
                    <p className="grid grid-flow-col gap-2">
                      <span>□</span>
                      <span>溶出時刻</span>
                    </p>
                    <div className="border-b-2 border-black w-32 text-center">
                      :
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-200 pl-4 pr-4 pb-4 grid">
              <h3 className="text-lg">【テクネチウム注射液】</h3>
              <div className="border border-black bg-white pt-2 pl-4 pr-4 pb-4 grid content-between">
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
                （手順書や添付文書に基づいた目標量　18.5～111 MBq / 2～8 mL）
              </p>
            </div>
            <ul className="grid gap-1 pl-4">
              <li className="grid grid-flow-col gap-4 justify-start">
                <p className="grid grid-flow-col gap-2">
                  <span>□</span>
                  <span>（溶出）バイアルのゴム栓の消毒</span>
                </p>
              </li>
              <li className="grid grid-flow-col gap-8 justify-start">
                <p className="grid grid-flow-col gap-2">
                  <span>□</span>
                  <span>（溶出）バイアルからの抜き取り量</span>
                </p>
                <div className="grid grid-flow-col">
                  <div className="border-b-2 border-black w-24"></div>
                  <p>MBq</p>
                </div>
                <div className="grid grid-flow-col">
                  <div className="border-b-2 border-black w-16"></div>
                  <p>mL</p>
                </div>
              </li>
              <li className="grid grid-flow-col gap-44 justify-start">
                <p className="grid grid-flow-col gap-2">
                  <span>□</span>
                  <span>希釈・濃度調整に用いる生理食塩液量</span>
                </p>
                <div className="grid grid-flow-col">
                  <div className="border-b-2 border-black w-16"></div>
                  <p>mL</p>
                </div>
              </li>
              <li className="grid grid-flow-col gap-24 justify-start">
                <p className="grid grid-flow-col gap-2">
                  <span>□</span>
                  <span>調整済テクネチウム溶液量</span>
                </p>
                <div className="grid gap gap-8 grid-flow-col justify-start">
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-24"></div>
                    <p>MBq</p>
                  </div>
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-16"></div>
                    <p>mL ・・・(a)</p>
                  </div>
                </div>
              </li>
              <li>
                <p className="grid grid-flow-col gap-4 justify-start">
                  <span></span>
                  <span className="font-bold">
                    （希釈・濃度調整終了時刻　　　:　　　）
                  </span>
                </p>
              </li>
            </ul>
          </div>

          {/* 標識 */}
          <div className="grid grid-flow-col justify-between items-start">
            <div>
              <h2>【標識】</h2>
              <ul className="grid gap-1 pl-4">
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>常温戻し時刻 (　　　：　　　)</span>
                </li>
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>キットバイアルゴム栓の消毒</span>
                </li>
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>内容物の確認</span>
                </li>
                <li>
                  <div className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <p>未使用注射針筒で(a)をキットバイアルに</p>
                  </div>
                  <div className="grid grid-flow-col justify-start pl-6">
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-16"></div>
                      <p>mL</p>
                    </div>
                    <p>追加</p>
                  </div>
                </li>
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>振とう</span>
                </li>
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>内容物の溶解と異物・異常着色の確認</span>
                </li>
                <li className="pl-5 font-bold">
                  （標識終了時刻　　　：　　　）
                </li>
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>標識後静置不要 ・・・(b)</span>
                </li>
              </ul>
            </div>

            <div className="border border-black pl-4 pr-4 pb-8 pt-8 grid gap-2">
              <h3 className="text-lg">キットバイアル情報</h3>
              <ul>
                <li>製品名　：テクネフチン酸キット</li>
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
              <li className="grid grid-flow-col gap-2 justify-start">
                <span>□</span>
                <span>未使用の注射針、注射筒を用意する</span>
              </li>
              <li className="grid grid-flow-col gap-28 justify-start">
                <p className="grid grid-flow-col gap-2">
                  <span>□</span>
                  <span>(b)から抜き取った標識薬</span>
                </p>
                <div className="grid grid-flow-col gap-8 justify-start">
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-24"></div>
                    <p>MBq</p>
                  </div>
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-16"></div>
                    <p>mL ・・・(c)</p>
                  </div>
                </div>
              </li>
              <li className="font-bold pl-5">（分注終了時刻　　　：　　　）</li>
            </ul>
          </div>

          {/* 投与準備 */}
          <div className="grid grid-flow-col justify-between items-end">
            {/* 投与準備（左側） */}
            <div>
              <h2>【投与準備】</h2>
              <ul className="grid gap-1 pl-4">
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>誤投与防止対策（注射筒(c)へのラベル貼付）</span>
                </li>
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>貯蔵（保管）箱内にて整頓と保管</span>
                </li>
                <li className="font-bold pl-5">
                  （調製終了時刻　　　：　　　）
                </li>
                <li className="border-b border-black justify-self-start pl-4 pr-4">
                  標識後できるだけ早く投与
                </li>
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
      ))}
    </div>
  );
};
