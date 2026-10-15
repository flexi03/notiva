import { findStudyDashboard } from '@/lib/study/sync'
import { HSD_PROFILE, parseUniversityProfile, type UniversityProfile } from '@/lib/university'
import type { Workspace } from '@/lib/workspace'

/** The university profile of the study folder ("Studium/Hochschule.md"), else Hochschule Düsseldorf. */
export function currentProfile(ws: Workspace | null | undefined): UniversityProfile {
  if (!ws) return HSD_PROFILE
  const dash = findStudyDashboard(ws)
  const page = dash ? ws.get(`${dash.folder}/Hochschule.md`) : undefined
  return parseUniversityProfile(page?.data)
}
