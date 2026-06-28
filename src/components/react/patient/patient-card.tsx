import type { FC } from "react";
import { Card } from "../card";
import { calculateAge, cn, toKatakana } from "@/lib/utils";
import { PatientName } from "../patient-name";
import type { Patient } from "@/types/patient";

interface Props {
  patient: Patient;
}

export const PatientCard: FC<Props> = ({ patient }) => {
  return (
    <Card className={cn("grid grid-flow-col justify-between")}>
      <div>
        <div>{patient.patient_id}</div>
        <div>
          <PatientName
            last_name_kanji={patient.last_name_kanji}
            last_name_kana={toKatakana(patient.last_name_kana)}
            first_name_kanji={patient.first_name_kanji}
            first_name_kana={toKatakana(patient.first_name_kana)}
          />
        </div>
      </div>
      <div className={cn("grid content-between")}>
        <div className={cn("justify-self-end")}>{patient.gender}</div>
        <div>{calculateAge(patient.birth_date)} 歳</div>
      </div>
    </Card>
  );
};
