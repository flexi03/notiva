import { examPrep } from '../examPrep'

const U = 'Studium/Unterlagen'

describe('examPrep', () => {
  it('finds practice exams and sheets with their solutions (real file names)', () => {
    const prep = examPrep([
      `${U}/DTT/Sonstiges/DTT_Probeklausur.pdf`,
      `${U}/DTT/Sonstiges/DTT_Probeklausur_Musterlösung.pdf`,
      `${U}/DTT/Praktikum & Übung/DTT_Uebung1_SoSe2022.pdf`,
      `${U}/DTT/Praktikum & Übung/DTT_Uebung1_SoSe2022_Loesung.pdf`,
      `${U}/DTT/Praktikum & Übung/DTT_Uebung1_Mitschrift.pdf`,
      `${U}/DTT/Sonstiges/Klausurhinweise_DBTT_SS2026.pdf`,
      `${U}/DBS1/Sonstiges/2023_SS_DBS1_Uebungsklausur .pdf`,
      `${U}/DBS1/Sonstiges/2023_SS_DBS1_Uebungsklausur_Loesung.pdf`,
      `${U}/DBS2/Sonstiges/DBS2 _Klausur-Übungsaufgaben_I.pdf`,
      `${U}/DBS2/Praktikum & Übung/DBS2 - Praktikum 01 - Vorbereitungsblatt.pdf`,
      `${U}/DBS1/Praktikum & Übung/aufgabe4a.sql`,
      `${U}/BS/Praktikum & Übung/Übung 5 30.10.2025 1137.pdf`,
    ])
    expect(prep.exams).toEqual([
      {
        path: `${U}/DBS1/Sonstiges/2023_SS_DBS1_Uebungsklausur .pdf`,
        solution: `${U}/DBS1/Sonstiges/2023_SS_DBS1_Uebungsklausur_Loesung.pdf`,
      },
      { path: `${U}/DBS2/Sonstiges/DBS2 _Klausur-Übungsaufgaben_I.pdf` },
      {
        path: `${U}/DTT/Sonstiges/DTT_Probeklausur.pdf`,
        solution: `${U}/DTT/Sonstiges/DTT_Probeklausur_Musterlösung.pdf`,
      },
    ])
    expect(prep.sheets).toEqual([
      {
        path: `${U}/DTT/Praktikum & Übung/DTT_Uebung1_SoSe2022.pdf`,
        solution: `${U}/DTT/Praktikum & Übung/DTT_Uebung1_SoSe2022_Loesung.pdf`,
      },
      { path: `${U}/BS/Praktikum & Übung/Übung 5 30.10.2025 1137.pdf` },
    ])
    expect(prep.hints).toEqual([`${U}/DTT/Sonstiges/Klausurhinweise_DBTT_SS2026.pdf`])
  })
})
