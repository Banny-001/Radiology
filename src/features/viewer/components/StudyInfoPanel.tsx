import type { useStudies } from "../../../context/StudyContext";


export function StudyInfoPanel({
  study,
}: {
  study: ReturnType<typeof useStudies>["studies"][0];
}) {
  const fields = [
    { label: "Patient Name", value: study.patient.name },
    { label: "Patient ID", value: study.patient.patientId },
    { label: "Date of Birth", value: study.patient.dob },
    { label: "Sex", value: study.patient.sex },
    { label: "Body Part Examined", value: study.bodyPart },
    { label: "Study Description", value: study.description },
    { label: "Modality", value: study.modality },
    { label: "Clinical History", value: study.clinicalHistory },
    { label: "Referring Doctor", value: study.referringDoctor },
    {
      label: "Assigned Radiologist",
      value: study.assignedRadiologist ?? "Unassigned",
    },
    { label: "Institution", value: study.institution },
    {
      label: "Study Date",
      value: new Date(study.studyDate).toLocaleDateString(),
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {fields.map((f) => (
        <div
          key={f.label}
          style={{
            padding: "8px 10px",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.03)",
            marginBottom: "3px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              color: "#4b5563",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: "2px",
            }}
          >
            {f.label}
          </div>
          <div style={{ fontSize: "13px", color: "#e5e7eb", fontWeight: 500 }}>
            {f.value || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}