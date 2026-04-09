import { useState } from "react";

export function PatientRegister({ onAdded }: { onAdded: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [type, setType] = useState("ri");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError(""); // ← 毎回リセット（重要）

    const normalized = patientId
      .trim() // 前後の空白削除
      .replace(/[０-９]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0),
      );

    // ✅ フロントバリデーション
    if (!/^\d+$/.test(normalized)) {
      setError("数字のみ入力してください");
      return;
    }

    if (normalized.length > 10) {
      setError("10桁以内で入力してください");
      return;
    }

    try {
      // ✅ Rust呼び出し
      await window.__TAURI__.core.invoke("add_patient", {
        patientId: normalized,
        patientType: type,
      });

      // ✅ 成功時
      setPatientId("");
      setError("");
      onAdded();
    } catch (e) {
      // ✅ ここが今回の本質
      setError(String(e).replace("Error: ", ""));
    }
  };

  return (
    <div>
      <h2>患者登録</h2>

      <input
        value={patientId}
        onChange={(e) => {
          setPatientId(e.target.value);
          setError(""); // ←これ追加
        }}
        onFocus={() => setError("")}
        placeholder="患者ID"
      />

      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="ri">RI患者</option>
        <option value="rt">治療患者</option>
      </select>

      <button onClick={handleSubmit}>登録</button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
