/**
 * Study programs: the modules of a degree under one examination regulation ("Prüfungsordnung", PO)
 * – numbers, ECTS, the semester the study plan puts them in, exam form and prerequisites. Which
 * modules exist and how they are numbered depends on the PO, so each program is one PO.
 *
 * Data comes from the published module handbook; see {@link PROGRAMS}.
 */

export type ModuleKind = 'Pflicht' | 'Wahlpflicht' | 'Wahl'

export interface CatalogModule {
  /** Module number in the handbook, e.g. "BMI 01". */
  nr: string
  name: string
  /** Other names and abbreviations (Moodle, eCampus, exam plan). */
  aliases?: string[]
  ects: number
  /** Semester of the study plan (Studienverlaufsplan); none for electives. */
  semester?: number
  /** Offered in the winter or summer semester. */
  offered?: 'WiSe' | 'SoSe'
  area?: string
  kind: ModuleKind
  /** Teaching forms, e.g. "2V 2P" (V lecture, Ü exercise, P lab, S seminar, Pr project). */
  teaching?: string
  /** Form of the exam. */
  exam?: string
  /** What has to be done before the exam (e.g. the lab). */
  prerequisite?: string
  /** Exam number in the campus system (eCampus), if it follows a rule. */
  examNumber?: string
  /** Elective modules: counts for one of these slots. */
  slots?: string[]
}

export interface StudyProgram {
  id: string
  /** Short name, e.g. "BMI". */
  code: string
  title: string
  degree: string
  university: string
  po: string
  /** Code of the program in the exam plan (e.g. "BMI18"). */
  planCode?: string
  semesters: number
  ects: number
  modules: CatalogModule[]
  sources: { handbook?: string; examPlans?: string }
}

/* ---------- HS Düsseldorf, B.Sc. Medieninformatik, PO 2018 (Modulhandbuch V2.5.1) ---------- */

const I = 'Informatik'
const M = 'Digitale Medien'
const G = 'Grundlagen & Querschnitt'
const U = 'Übergreifend'
const KLAUSUR = 'Klausur'
const PORTFOLIO = 'Portfolio'
const PROJEKT = 'Projektprüfung'
const MUENDLICH = 'Mündlich'
const LAB = 'Praktikum'

const bmi = (n: number) => `BMI ${String(n).padStart(2, '0')}`
const req = (
  n: number,
  name: string,
  semester: number,
  offered: 'WiSe' | 'SoSe',
  area: string,
  teaching: string,
  exam: string,
  extra: Partial<CatalogModule> = {},
): CatalogModule => ({
  nr: bmi(n),
  name,
  ects: 5,
  semester,
  offered,
  area,
  kind: 'Pflicht',
  teaching,
  exam,
  examNumber: String(3000 + n * 10),
  ...extra,
})
const VERTIEFUNG = ['Vertiefung A', 'Vertiefung B', 'Vertiefung C', 'Vertiefung D', 'Individuelle Vertiefung']
const VERTIEFUNG_B = ['Vertiefung B', 'Vertiefung D', 'Individuelle Vertiefung']
const elective = (
  n: number,
  name: string,
  offered: 'WiSe' | 'SoSe',
  exam: string,
  slots: string[],
  extra: Partial<CatalogModule> = {},
): CatalogModule => ({
  nr: bmi(n),
  name,
  ects: 5,
  offered,
  kind: 'Wahl',
  exam,
  slots,
  examNumber: String(3000 + n * 10),
  ...extra,
})

export const HSD_BMI_2018: StudyProgram = {
  id: 'hsd-bmi-2018',
  code: 'BMI',
  title: 'Medieninformatik',
  degree: 'B.Sc.',
  university: 'Hochschule Düsseldorf',
  po: '2018',
  planCode: 'BMI18',
  semesters: 7,
  ects: 210,
  sources: {
    handbook:
      'https://medien.hs-duesseldorf.de/studium/studiengaenge/Documents/Modulhandb%C3%BCcher/BMI_PO2018_Modulhandbuch_V2-5-1.pdf',
    examPlans:
      'https://medien.hs-duesseldorf.de/studium/pruefungen/Seiten/pruefungsanmeldungen-und-abmeldungen.aspx',
  },
  modules: [
    // 1. Semester
    req(1, 'Objektorientierte Programmierung 1', 1, 'WiSe', I, '2V 2P', KLAUSUR, {
      aliases: ['OOP 1', 'OOP1'],
      prerequisite: LAB,
    }),
    req(19, 'Rechnernetze', 1, 'WiSe', I, '2V 2Ü', KLAUSUR, { aliases: ['RN', 'Computer Networks'] }),
    req(3, 'Webprogrammierung', 1, 'WiSe', I, '2V 2Ü', KLAUSUR, { aliases: ['WebPr', 'Web-Programmierung'] }),
    req(4, 'Mediengestaltung 1', 1, 'WiSe', M, '4S', PORTFOLIO, { aliases: ['MG 1', 'MG1'] }),
    req(35, 'Rechnerarchitektur und Professionelles Studieren', 1, 'WiSe', G, '2V 2Ü', KLAUSUR, {
      aliases: ['RAPS', 'Rechnerarchitektur'],
      prerequisite: 'Übung Professionelles Studieren',
    }),
    req(5, 'Mathematik 1', 1, 'WiSe', G, '3V 2Ü', KLAUSUR, { aliases: ['Mathe 1', 'Mathe1'] }),
    // 2. Semester
    req(7, 'Objektorientierte Programmierung 2', 2, 'SoSe', I, '2V 2P', KLAUSUR, {
      aliases: ['OOP 2', 'OOP2'],
      prerequisite: LAB,
    }),
    req(2, 'Datenbanksysteme 1', 2, 'SoSe', I, '2V 2P', KLAUSUR, {
      aliases: ['DBS 1', 'DBS1', 'Datenbanken 1'],
      prerequisite: LAB,
    }),
    req(10, 'Informatikprojekt 1', 2, 'SoSe', I, '1S 3Pr', PROJEKT, {
      kind: 'Wahlpflicht',
      aliases: ['IP 1', 'IP1'],
      prerequisite: 'Projekt',
    }),
    req(14, 'Formale Modelle und Algorithmen', 2, 'SoSe', I, '3V 2Ü', KLAUSUR, { aliases: ['FMA'] }),
    req(11, 'Mediengestaltung 2', 2, 'SoSe', M, '4S', PORTFOLIO, { aliases: ['MG 2', 'MG2'] }),
    req(12, 'Mathematik 2', 2, 'SoSe', G, '3V 2Ü', KLAUSUR, { aliases: ['Mathe 2', 'Mathe2'] }),
    // 3. Semester
    req(13, 'Software Engineering', 3, 'WiSe', I, '2V 2P', KLAUSUR, { aliases: ['SE'], prerequisite: LAB }),
    req(8, 'Datenbanksysteme 2', 3, 'WiSe', I, '2V 2P', KLAUSUR, {
      aliases: ['DBS 2', 'DBS2', 'Datenbanken 2'],
      prerequisite: LAB,
    }),
    req(15, 'Informatikprojekt 2', 3, 'WiSe', I, '1S 3Pr', PROJEKT, {
      kind: 'Wahlpflicht',
      aliases: ['IP 2', 'IP2'],
      prerequisite: 'Projekt',
    }),
    req(16, 'Grundlagen der Computergrafik', 3, 'WiSe', M, '2V 1Ü 1P', KLAUSUR, {
      aliases: ['Computergrafik', 'GCG', 'Grundlagen Computergrafik'],
      prerequisite: LAB,
    }),
    req(17, 'Mensch-Computer-Interaktion', 3, 'WiSe', M, '3V 1S', KLAUSUR, { aliases: ['MCI'] }),
    req(18, 'Mathematik 3', 3, 'WiSe', G, '3V 2Ü', KLAUSUR, { aliases: ['Mathe 3', 'Mathe3'] }),
    // 4. Semester
    req(22, 'Web Engineering', 4, 'SoSe', I, '2V 2P', KLAUSUR, { aliases: ['WebEng'], prerequisite: LAB }),
    req(26, 'IT-Sicherheit', 4, 'SoSe', I, '2V 2Ü', KLAUSUR, { aliases: ['IT-Sec', 'IT Security'] }),
    req(36, 'Vertiefung A', 4, 'SoSe', I, '2V 2W', 'durch Wahlmodul', { kind: 'Wahlpflicht' }),
    req(37, 'Vertiefung B', 4, 'SoSe', M, '4W', 'durch Wahlmodul', { kind: 'Wahlpflicht' }),
    req(21, 'Medienprojekt A', 4, 'SoSe', M, '2S 3Pr', PROJEKT, {
      kind: 'Wahlpflicht',
      aliases: ['MP A'],
      prerequisite: 'Projekt',
    }),
    req(23, 'Digitale Bild- und Tontechnik', 4, 'SoSe', M, '2V 2Ü', KLAUSUR, {
      aliases: ['DBT', 'Bild- und Tontechnik'],
    }),
    // 5. Semester
    req(40, 'Betriebssysteme', 5, 'WiSe', I, '2V 2Ü', KLAUSUR, { aliases: ['BS'] }),
    req(38, 'Vertiefung C', 5, 'WiSe', I, '2V 2W', 'durch Wahlmodul', { kind: 'Wahlpflicht' }),
    req(39, 'Vertiefung D', 5, 'WiSe', M, '4W', 'durch Wahlmodul', { kind: 'Wahlpflicht' }),
    req(28, 'Medienprojekt B', 5, 'WiSe', M, '2S 3Pr', PROJEKT, {
      kind: 'Wahlpflicht',
      aliases: ['MP B'],
      prerequisite: 'Projekt',
    }),
    req(24, 'Grundlagen der Betriebswirtschaft', 5, 'WiSe', G, '3V 1S', KLAUSUR, { aliases: ['BWL'] }),
    req(31, 'Projektmanagement, Medien- und IT-Recht', 5, 'WiSe', G, '2V 2S', KLAUSUR, {
      aliases: ['PM & IT-Recht', 'Projektmanagement, Medien und IT-Recht'],
    }),
    // 6. and 7. Semester
    req(41, 'Externes Semester', 6, 'SoSe', U, 'Praxis-, Auslands- oder Forschungssemester', MUENDLICH, {
      ects: 30,
      aliases: ['Praxissemester', 'Auslandssemester'],
      prerequisite: 'Bericht und Nachweis',
    }),
    req(42, 'Individuelle Vertiefung', 7, 'WiSe', U, '1–4W', 'durch Wahlmodul', { kind: 'Wahlpflicht' }),
    req(34, 'Wissenschaftliche Vertiefung', 7, 'WiSe', U, 'Studienarbeit', PROJEKT, { ects: 10 }),
    req(
      32,
      'Bachelorarbeit mit Kolloquium',
      7,
      'WiSe',
      U,
      'Abschlussarbeit',
      'Bachelorarbeit und Kolloquium',
      {
        ects: 15,
        aliases: ['Bachelorarbeit', 'Thesis'],
      },
    ),
    // Electives (catalogue A: practical media informatics, B: digital media)
    elective(51, 'E-Business', 'WiSe', PORTFOLIO, VERTIEFUNG),
    elective(52, 'Interaktive Systeme', 'SoSe', KLAUSUR, VERTIEFUNG),
    elective(53, 'Multimedia-Kommunikation', 'WiSe', MUENDLICH, VERTIEFUNG),
    elective(54, 'Vertiefung Computergrafik', 'SoSe', KLAUSUR, VERTIEFUNG),
    elective(55, 'Virtuelle Realität', 'WiSe', MUENDLICH, VERTIEFUNG, {
      aliases: ['VR', 'Virtuelle Realität und AR'],
    }),
    elective(56, 'Web-Frameworks', 'WiSe', MUENDLICH, VERTIEFUNG),
    elective(57, 'Entwicklung sicherer Software', 'SoSe', MUENDLICH, VERTIEFUNG),
    elective(58, 'Web-Apps', 'SoSe', MUENDLICH, VERTIEFUNG),
    elective(59, 'Computeranimation', 'WiSe', PORTFOLIO, VERTIEFUNG, { aliases: ['Computer Animation'] }),
    elective(60, 'Software-Architektur', 'SoSe', PORTFOLIO, VERTIEFUNG),
    elective(61, 'Security Engineering', 'WiSe', KLAUSUR, VERTIEFUNG),
    elective(71, 'Unternehmensgründung', 'WiSe', MUENDLICH, ['Individuelle Vertiefung']),
    elective(72, 'Multimediales Erzählen / Konzeption & Entwurf', 'WiSe', PORTFOLIO, VERTIEFUNG_B),
    elective(73, 'Pencils & Polygons', 'SoSe', PORTFOLIO, VERTIEFUNG_B),
    elective(75, 'Kommunikationsdesign', 'SoSe', PORTFOLIO, VERTIEFUNG_B),
    elective(76, 'Digital Literacy', 'SoSe', PORTFOLIO, VERTIEFUNG_B),
    elective(77, 'Corporate Learning', 'WiSe', PORTFOLIO, VERTIEFUNG_B),
    elective(78, 'Intelligente Systeme', 'SoSe', MUENDLICH, VERTIEFUNG_B),
    elective(79, 'Einführung in die 3D-Modellierung', 'WiSe', MUENDLICH, VERTIEFUNG_B),
    elective(81, 'Vertiefung Netzwerktechnik', 'SoSe', PORTFOLIO, VERTIEFUNG),
    elective(93, 'Informationsvisualisierung', 'WiSe', PORTFOLIO, VERTIEFUNG),
    elective(95, 'Digitale Filmproduktion', 'WiSe', PORTFOLIO, VERTIEFUNG_B),
    elective(96, 'Mobile Anwendungen', 'SoSe', KLAUSUR, VERTIEFUNG, { aliases: ['Mobile Apps'] }),
  ],
}

export const PROGRAMS: StudyProgram[] = [HSD_BMI_2018]

export function programById(id: string | undefined): StudyProgram | undefined {
  return PROGRAMS.find((p) => p.id === id)
}

/** Modules of the study plan (everything but the electives). */
export const planModules = (program: StudyProgram) => program.modules.filter((m) => m.kind !== 'Wahl')
