// 作業報告書で使う一覧（メーカー・装置・作業担当者・担当技師の別表記）と、Claude 用の指示文。
import { ArrowLeft, Check, Copy, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/react/layout/page-header";
import { onDataChanged } from "@/lib/live";
import { go } from "@/lib/nav";
import {
  addStaffAlias,
  CLAUDE_PROMPT,
  deleteMaster,
  deleteStaffAlias,
  getOptions,
  saveMaster,
  type WorkReportOptions,
} from "@/lib/work-reports";

const inputClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type Column = {
  key: string;
  label: string;
  /** select にするときの選択肢 */
  choices?: { value: number; label: string }[];
  placeholder?: string;
};

type Row = { id: number | null; values: Record<string, string> };

/** 1 行ずつ編集して保存する表。最後の行は新規追加用。 */
function MasterTable({
  title,
  description,
  columns,
  rows,
  onSave,
  onDelete,
  deleteMessage,
}: {
  title: string;
  description: string;
  columns: Column[];
  rows: Row[];
  onSave: (id: number | null, values: Record<string, string>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  deleteMessage: (values: Record<string, string>) => string;
}) {
  const blank = Object.fromEntries(columns.map((column) => [column.key, ""]));
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [error, setError] = useState("");

  const keyOf = (id: number | null) => (id === null ? "new" : String(id));
  const valuesOf = (row: Row) => edits[keyOf(row.id)] ?? row.values;
  const changed = (row: Row) =>
    columns.some(
      (column) =>
        (valuesOf(row)[column.key] ?? "") !== (row.values[column.key] ?? ""),
    );

  const edit = (row: Row, key: string, value: string) =>
    setEdits((current) => ({
      ...current,
      [keyOf(row.id)]: { ...valuesOf(row), [key]: value },
    }));

  const save = async (row: Row) => {
    try {
      await onSave(row.id, valuesOf(row));
      setEdits((current) => {
        const next = { ...current };
        delete next[keyOf(row.id)];
        return next;
      });
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  };

  const remove = async (row: Row) => {
    if (row.id === null || !window.confirm(deleteMessage(row.values))) return;
    try {
      await onDelete(row.id);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  };

  const all: Row[] = [...rows, { id: null, values: blank }];

  return (
    <Card>
      <CardContent>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-y-1.5 text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  {columns.map((column) => (
                    <th key={column.key} className="pr-2 font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th className="w-0" />
                </tr>
              </thead>
              <tbody>
                {all.map((row) => {
                  const values = valuesOf(row);
                  const isNew = row.id === null;
                  return (
                    <tr key={keyOf(row.id)}>
                      {columns.map((column) => (
                        <td key={column.key} className="pr-2">
                          {column.choices ? (
                            <select
                              aria-label={column.label}
                              className={inputClass}
                              value={values[column.key] ?? ""}
                              onChange={(event) =>
                                edit(row, column.key, event.target.value)
                              }
                            >
                              <option value="">-</option>
                              {column.choices.map((choice) => (
                                <option key={choice.value} value={choice.value}>
                                  {choice.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={column.label}
                              className={inputClass}
                              placeholder={
                                isNew ? column.placeholder : undefined
                              }
                              value={values[column.key] ?? ""}
                              onChange={(event) =>
                                edit(row, column.key, event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void save(row);
                                }
                              }}
                            />
                          )}
                        </td>
                      ))}
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant={isNew ? "default" : "outline"}
                            size="sm"
                            className="h-9"
                            disabled={!changed(row)}
                            onClick={() => void save(row)}
                          >
                            {isNew ? "追加" : "保存"}
                          </Button>
                          {!isNew && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-lg"
                              aria-label="削除"
                              onClick={() => void remove(row)}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffAliases({ options }: { options: WorkReportOptions }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const add = async (userId: number) => {
    const alias = (drafts[userId] ?? "").trim();
    if (!alias) return;
    try {
      await addStaffAlias(userId, alias);
      setDrafts((current) => ({ ...current, [userId]: "" }));
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Card>
      <CardContent>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <h3 className="text-lg font-semibold tracking-tight">
              担当技師の別表記
            </h3>
            <p className="text-sm text-muted-foreground">
              報告書には担当技師がローマ字（例: Tsuzuki
              Shoya）で書かれます。ここに登録した表記は、取り込むときに担当者一覧の人に自動で結び付けます。
              報告書の画面で担当技師を選んで保存したときも、自動で登録されます。姓と名の順番、大文字・小文字は区別しません。
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <ul className="grid gap-2">
            {options.staff.map((person) => {
              const aliases = options.staffAliases.filter(
                (item) => item.userId === person.id,
              );
              return (
                <li
                  key={person.id}
                  className="grid gap-2 rounded-md border p-2 sm:grid-cols-[8rem_1fr_16rem] sm:items-center"
                >
                  <span className="font-medium">{person.name}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {aliases.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm"
                      >
                        {item.alias}
                        <button
                          type="button"
                          aria-label={`${item.alias} を削除`}
                          className="rounded-full p-0.5 hover:bg-background"
                          onClick={() =>
                            void deleteStaffAlias(item.id).catch((err) =>
                              setError(errorText(err)),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    ))}
                    {aliases.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        なし
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <input
                      aria-label={`${person.name} の別表記`}
                      placeholder="ローマ字など"
                      className={inputClass}
                      value={drafts[person.id] ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [person.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void add(person.id);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-9"
                      disabled={!(drafts[person.id] ?? "").trim()}
                      onClick={() => void add(person.id)}
                    >
                      追加
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ClaudePrompt() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("コピーしてください", CLAUDE_PROMPT);
    }
  };
  return (
    <Card>
      <CardContent>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold tracking-tight">
              紙の報告書を取り込むとき（Claude 用の指示文）
            </h3>
            <Button type="button" variant="outline" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "コピーしました" : "指示文をコピー"}
            </Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              スマホの Claude
              アプリで、報告書の写真と一緒にこの指示文を送ります（プロジェクトの指示に入れておくと、毎回貼らずに済みます）。
            </li>
            <li>
              Claude が返した JSON を「報告書1.json」のような名前で保存します。
            </li>
            <li>
              JSON
              と写真（「報告書1.jpg」「報告書1-2.jpg」のように同じ名前で始めたもの）を
              USB でアプリの PC に移し、 アプリと同じフォルダの{" "}
              <code>import/work_report</code> に置きます。10
              秒ほどで「要確認」として登録され、写真も添付されます。
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            PDF でもらった報告書は、Claude
            を使わずにそのまま同じフォルダに置くか、一覧の「PDF・JSON
            を取り込む」から読み込めます。
          </p>
          <pre className="max-h-72 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
            {CLAUDE_PROMPT}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkReportSettings() {
  const [options, setOptions] = useState<WorkReportOptions | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    void getOptions()
      .then((next) => {
        setOptions(next);
        setError("");
      })
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, []);

  if (!options) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  const manufacturerChoices = options.manufacturers.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const modalityChoices = options.modalities.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const id = (value: string) => (value ? Number(value) : null);
  const after = async (action: Promise<unknown>) => {
    await action;
    load();
  };

  return (
    <PageContainer className="gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="lg" onClick={() => go("/work-report/")}>
          <ArrowLeft />
          一覧へ
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">
          作業報告書の設定
        </h2>
      </div>

      <MasterTable
        title="装置"
        description="装置番号は報告書の「納入商品」などの番号です。取り込むときはこの番号で装置を見分けるので、報告書のメーカー表記が VARIAN から Siemens Healthineers に変わっても同じ装置の履歴にまとまります。一覧にない装置は、取り込んだときに自動で登録されます。"
        columns={[
          { key: "name", label: "装置名", placeholder: "例: CLINAC iX" },
          { key: "serialNo", label: "装置番号", placeholder: "例: H295977" },
          {
            key: "manufacturerId",
            label: "メーカー",
            choices: manufacturerChoices,
          },
          { key: "modalityId", label: "モダリティ", choices: modalityChoices },
        ]}
        rows={options.devices.map((item) => ({
          id: item.id,
          values: {
            name: item.name,
            serialNo: item.serialNo,
            manufacturerId: item.manufacturerId
              ? String(item.manufacturerId)
              : "",
            modalityId: item.modalityId ? String(item.modalityId) : "",
          },
        }))}
        onSave={(rowId, values) =>
          after(
            saveMaster("devices", rowId, {
              name: values.name,
              serialNo: values.serialNo,
              manufacturerId: id(values.manufacturerId),
              modalityId: id(values.modalityId),
            }),
          )
        }
        onDelete={(rowId) => after(deleteMaster("devices", rowId))}
        deleteMessage={(values) =>
          `${values.name} を削除しますか？\n（この装置の作業報告書は消えず、装置が未設定になります）`
        }
      />

      <MasterTable
        title="作業担当者（メーカー）"
        description="報告書の「作業担当者」です。取り込んだときに一覧にない人は自動で登録されます。連絡事項の「共同作業者：東」のような書き方も、一覧の人に 1 人に決まれば自動で追加します。"
        columns={[
          { key: "name", label: "氏名", placeholder: "例: 東 尚人" },
          {
            key: "nameRoman",
            label: "ローマ字",
            placeholder: "例: Naoto Higashi",
          },
          {
            key: "manufacturerId",
            label: "メーカー",
            choices: manufacturerChoices,
          },
        ]}
        rows={options.engineers.map((item) => ({
          id: item.id,
          values: {
            name: item.name,
            nameRoman: item.nameRoman,
            manufacturerId: item.manufacturerId
              ? String(item.manufacturerId)
              : "",
          },
        }))}
        onSave={(rowId, values) =>
          after(
            saveMaster("engineers", rowId, {
              name: values.name,
              nameRoman: values.nameRoman,
              manufacturerId: id(values.manufacturerId),
            }),
          )
        }
        onDelete={(rowId) => after(deleteMaster("engineers", rowId))}
        deleteMessage={(values) =>
          `${values.name} を削除しますか？\n（これまでの作業報告書からも外れます）`
        }
      />

      <StaffAliases options={options} />

      <MasterTable
        title="メーカー"
        description="別の表記には、報告書や Claude の読み取り結果に書かれることのあるメーカー名を「、」で区切って入れます（例: VARIAN、バリアン）。"
        columns={[
          { key: "name", label: "メーカー名", placeholder: "例: Varian" },
          {
            key: "aliases",
            label: "別の表記",
            placeholder: "例: VARIAN、バリアン",
          },
        ]}
        rows={options.manufacturers.map((item) => ({
          id: item.id,
          values: { name: item.name, aliases: item.aliases },
        }))}
        onSave={(rowId, values) =>
          after(saveMaster("manufacturers", rowId, values))
        }
        onDelete={(rowId) => after(deleteMaster("manufacturers", rowId))}
        deleteMessage={(values) =>
          `${values.name} を削除しますか？\n（このメーカーの装置・作業担当者は、メーカーが未設定になります）`
        }
      />

      <ClaudePrompt />
    </PageContainer>
  );
}
