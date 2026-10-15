/**
 * Everything university-specific in one place: Moodle address, eCampus (HISinOne/QIS) pages, exam
 * plan page, program code, module catalogue. Built in: Hochschule Düsseldorf. Others (or changes)
 * live in the vault page "Studium/Hochschule.md" (frontmatter `hochschule:`) – editable by hand or
 * by the assistant; unknown or invalid values fall back to the built-in profile.
 */
import { parse } from 'yaml'
import type { FrontmatterData } from './frontmatter'
import { HSD_BMI_2018, programById, type CatalogModule, type StudyProgram } from './study/catalog'

export interface UniversityProfile {
  name: string
  moodle: { site: string }
  ecampus: { startUrl: string; examsUrl: string; ssoUrl?: string }
  examPlans?: { page: string; programCode?: string }
  /** Built-in program (catalogue id) – or an own one (modules below). */
  program?: string
  modules?: CatalogModule[]
}

export const HSD_PROFILE: UniversityProfile = {
  name: 'Hochschule Düsseldorf',
  moodle: { site: 'https://mdl.hs-duesseldorf.de' },
  ecampus: {
    startUrl: 'https://ecampus.hs-duesseldorf.de/qisserver/pages/cs/sys/portal/hisinoneStartPage.faces',
    examsUrl:
      'https://ecampus.hs-duesseldorf.de/qisserver/pages/cs/sys/portal/hisinoneIframePage.faces?id=Pruefungsverwaltung&navigationPosition=hisinoneMeinStudium%2CHSD_Pruefungsverwaltung&recordRequest=true',
    ssoUrl: 'https://ecampus.hs-duesseldorf.de/qisserver/api/identityprovider/redirect/2/login',
  },
  examPlans: { page: HSD_BMI_2018.sources.examPlans!, programCode: 'BMI18' },
  program: HSD_BMI_2018.id,
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const url = (v: unknown, fallback: string) => {
  if (typeof v !== 'string') return fallback
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' ||
      (u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname))
      ? u.toString().replace(/\/$/, '')
      : fallback
  } catch {
    return fallback
  }
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

function parseModules(raw: unknown): CatalogModule[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const list = raw.filter(isObject).flatMap((m): CatalogModule[] => {
    const nr = str(m.nr)
    const name = str(m.name)
    if (!nr || !name) return []
    const semester = Number(m.semester)
    return [
      {
        nr,
        name,
        ects: Number(m.ects) > 0 ? Number(m.ects) : 5,
        kind: m.kind === 'Wahlpflicht' || m.kind === 'Wahl' ? m.kind : 'Pflicht',
        ...(semester > 0 ? { semester } : {}),
        ...(m.offered === 'WiSe' || m.offered === 'SoSe' ? { offered: m.offered } : {}),
        ...(str(m.exam) ? { exam: str(m.exam)! } : {}),
        ...(str(m.prerequisite) ? { prerequisite: str(m.prerequisite)! } : {}),
        ...(str(m.examNumber) ? { examNumber: str(m.examNumber)! } : {}),
        ...(Array.isArray(m.aliases)
          ? { aliases: m.aliases.filter((a): a is string => typeof a === 'string') }
          : {}),
      },
    ]
  })
  return list.length ? list : undefined
}

/** Profile from the page's frontmatter (`hochschule:`), on top of the built-in one. */
export function parseUniversityProfile(data: FrontmatterData | undefined): UniversityProfile {
  const raw = data?.hochschule
  if (!isObject(raw)) return HSD_PROFILE
  const base = HSD_PROFILE
  const moodle = isObject(raw.moodle) ? raw.moodle : {}
  const ecampus = isObject(raw.ecampus) ? raw.ecampus : {}
  const plans = isObject(raw.pruefungsplan) ? raw.pruefungsplan : isObject(raw.examPlans) ? raw.examPlans : {}
  const modules = parseModules(raw.module ?? raw.modules)
  const ssoUrl = url(ecampus.ssoUrl ?? ecampus.anmeldung, base.ecampus.ssoUrl ?? '')
  const page = url(plans.seite ?? plans.page, base.examPlans?.page ?? '')
  const code = str(plans.studiengang ?? plans.programCode) ?? base.examPlans?.programCode
  return {
    name: str(raw.name) ?? base.name,
    moodle: { site: url(moodle.adresse ?? moodle.site, base.moodle.site) },
    ecampus: {
      startUrl: url(ecampus.startseite ?? ecampus.startUrl, base.ecampus.startUrl),
      examsUrl: url(ecampus.pruefungen ?? ecampus.examsUrl, base.ecampus.examsUrl),
      ...(ssoUrl ? { ssoUrl } : {}),
    },
    ...(page ? { examPlans: { page, ...(code ? { programCode: code } : {}) } } : {}),
    ...(str(raw.studiengang ?? raw.program)
      ? { program: str(raw.studiengang ?? raw.program)! }
      : base.program
        ? { program: base.program }
        : {}),
    ...(modules ? { modules } : {}),
  }
}

/** The program to plan with: own modules from the profile, else the built-in catalogue. */
export function programFor(
  profile: UniversityProfile,
  setupProgram: string | undefined,
): StudyProgram | undefined {
  const builtIn = programById(setupProgram ?? profile.program)
  if (!profile.modules) return builtIn
  const semesters = Math.max(6, ...profile.modules.map((m) => m.semester ?? 0))
  return {
    id: 'eigen',
    code: (profile.modules[0]!.nr.match(/^[A-Za-z]+/)?.[0] ?? 'M').toUpperCase(),
    title: builtIn?.title ?? 'Eigener Studiengang',
    degree: builtIn?.degree ?? '',
    university: profile.name,
    po: builtIn?.po ?? '',
    ...(profile.examPlans?.programCode ? { planCode: profile.examPlans.programCode } : {}),
    semesters,
    ects: profile.modules.reduce((s, m) => s + m.ects, 0),
    modules: profile.modules,
    sources: { ...(profile.examPlans ? { examPlans: profile.examPlans.page } : {}) },
  }
}

/** The page text for a new study folder: the HSD values, commented, ready to change. */
export const PROFILE_PAGE = `---
icon: 🏫
hochschule:
  name: Hochschule Düsseldorf
  moodle:
    adresse: https://mdl.hs-duesseldorf.de
  ecampus:
    startseite: ${HSD_PROFILE.ecampus.startUrl}
    pruefungen: ${HSD_PROFILE.ecampus.examsUrl}
    anmeldung: ${HSD_PROFILE.ecampus.ssoUrl}
  pruefungsplan:
    seite: ${HSD_PROFILE.examPlans!.page}
    studiengang: BMI18
  studiengang: hsd-bmi-2018
---
Hier steht alles, was an deiner Hochschule anders sein kann. Notiva ist auf die **Hochschule Düsseldorf**
eingestellt. An einer anderen Hochschule trägst du oben ihre Adressen ein – oder bittest den KI-Assistenten:
„Stelle Notiva auf die Uni X ein (Moodle-Adresse …, eCampus …)“.

- **moodle.adresse** – Startseite eures Moodle
- **ecampus** – HISinOne/QIS: Startseite, Seite der Prüfungsverwaltung, Anmelde-Link (SSO)
- **pruefungsplan** – Seite, auf der der Fachbereich die Prüfungsplan-PDFs verlinkt, und euer Studiengangs-Kürzel darin
- **studiengang** – eingebauter Katalog (\`hsd-bmi-2018\`) – oder eigene Module:

\`\`\`yaml
  module:
    - { nr: INF 01, name: Programmieren 1, ects: 5, semester: 1, offered: WiSe, exam: Klausur, prerequisite: Praktikum }
\`\`\`

Mehr dazu: docs/HOCHSCHULE.md im Notiva-Projekt.
`

export function profileFromPage(text: string): UniversityProfile {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  try {
    return parseUniversityProfile(m ? (parse(m[1]!) as FrontmatterData) : undefined)
  } catch {
    return HSD_PROFILE
  }
}
