import { useState, useEffect } from "react";
import { invoke } from "@/lib/api";

type Patient = {
  id: number;
  patient_id: string;
};

export function PatientList({
  patients,
  onDeleted,
}: {
  patients: Patient[];
  onDeleted: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPatientId, setEditPatientId] = useState("");
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  // const [list, setList] = useState<Patient[]>(patients);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleDelete = async (id: number) => {
    await invoke("remove_patient", { id });
    // loadPatients();
    setRefreshKey((prev) => prev + 1);
  };

  const startEdit = (p: Patient) => {
    setEditingId(p.id);
    setEditPatientId(p.patient_id);
    setError("");
    setRefreshKey((prev) => prev + 1);
  };

  const saveEdit = async (id: number) => {
    setError("");

    try {
      await invoke("edit_patient", {
        id,
        patientId: editPatientId,
      });

      setEditingId(null);
      setError("");
    } catch (e) {
      setError(String(e).replace("Error: ", ""));
    }
  };

  // const loadPatients = async () => {
  //   const data = await window.__TAURI__.core.invoke("search_patients_cmd", {
  //     keyword: keyword || null,
  //     sortDesc,
  //   });

  //   setList(data as Patient[]);
  // };

  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     loadPatients();
  //   }, 300);

  //   return () => clearTimeout(timer);
  // }, [keyword, sortDesc, refreshKey]); // ←追加

  return (
    <div>
      <h2>患者一覧</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* <input
        placeholder="患者ID検索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      <button onClick={() => setSortDesc(!sortDesc)}>
        {sortDesc ? "新しい順" : "古い順"}
      </button> */}

      {patients.map((p) => (
        <div key={p.id}>
          {editingId === p.id ? (
            <>
              <input
                value={editPatientId}
                onChange={(e) => setEditPatientId(e.target.value)}
              />

              <button onClick={() => saveEdit(p.id)}>保存</button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setError(""); // ←これ追加
                }}
              >
                キャンセル
              </button>
            </>
          ) : (
            <>
              ID: {p.id} / 患者ID: {p.patient_id}
              <button onClick={() => startEdit(p)}>編集</button>
              <button onClick={() => handleDelete(p.id)}>削除</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
