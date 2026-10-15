import { useEcampus } from '@/app/ecampus'
import { useMoodle } from '@/app/moodle'
import { useApp } from '@/app/store'
import { currentProfile } from '@/app/university'

/**
 * One click from "bitte neu anmelden": opens the sign-in window of eCampus or Moodle again with the
 * known addresses – no detour through the settings.
 */
export async function relogin(service: 'ecampus' | 'moodle'): Promise<void> {
  const app = useApp.getState()
  const profile = currentProfile(app.ws)
  if (service === 'ecampus') {
    const ecampus = useEcampus.getState()
    if (!ecampus.status) await ecampus.refresh()
    const status = useEcampus.getState().status
    await ecampus.connect({
      startUrl: status?.startUrl ?? profile.ecampus.startUrl,
      examsUrl: status?.examsUrl ?? profile.ecampus.examsUrl,
    })
    return
  }
  const moodle = useMoodle.getState()
  const site = moodle.status?.site ?? profile.moodle.site
  // Sign-in via the university (Microsoft) like the Moodle app; other ways need the settings.
  if (site && moodle.status?.mode !== 'calendar') await moodle.connect({ mode: 'browser', site })
  else app.navigate({ name: 'settings', section: 'study' })
}
