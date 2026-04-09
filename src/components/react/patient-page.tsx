import { useEffect, useState } from "react";
import { PatientRegister } from "@components/react/patient-register";
import { PatientList } from "@components/react/patient-list";

type Patient = {
  id: number;
  patient_id: string;
  patient_type: string;
};

export function PatientPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sortDesc, setSortDesc] = useState(true);

  const loadPatients = async () => {
    const data = await window.__TAURI__.core.invoke("search_patients_cmd", {
      keyword: keyword || null,
      sortDesc,
    });

    setPatients(data as Patient[]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients();
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, sortDesc]);

  return (
    <div>
      <PatientRegister onAdded={loadPatients} />

      <input
        placeholder="患者ID検索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />

      <button onClick={() => setSortDesc(!sortDesc)}>
        {sortDesc ? "新しい順" : "古い順"}
      </button>
      <PatientList patients={patients} onDeleted={loadPatients} />
    </div>
  );
}
