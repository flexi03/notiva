import { SemesterScreen } from './screens/SemesterScreen'
import { GradesScreen } from '@/screens/GradesScreen'
import { CourseScreen } from '@/screens/CourseScreen'
import { FileScreen } from '@/screens/FileScreen'
import { MoodleScreen } from '@/screens/MoodleScreen'
import { useEffect, useState } from 'react'
import { useApp } from '@/app/store'
import { autoOpen } from '@/app/vaults'
import { electronBridge } from '@/lib/vault'
import { useTheme } from '@/app/hooks/useTheme'
import { t } from '@/i18n'
import { Spinner } from '@/components/ui'
import { AppShell } from '@/components/layout/AppShell'
import { PageView } from '@/components/editor/PageView'
import { HomeScreen } from '@/screens/HomeScreen'
import { NewPageDialog } from '@/screens/NewPageDialog'
import { SearchDialog } from '@/screens/SearchDialog'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { TagScreen } from '@/screens/TagScreen'
import { TemplatesScreen } from '@/screens/TemplatesScreen'
import { TrashScreen } from '@/screens/TrashScreen'
import { WelcomeScreen } from '@/screens/WelcomeScreen'

export function App() {
  const { ws, route, settings, searchOpen, newPageOpen, syncRoute, setWorkspace } = useApp()
  const [booting, setBooting] = useState(true)
  useTheme(settings)

  useEffect(() => {
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [syncRoute])

  useEffect(() => {
    autoOpen()
      .then((opened) => (opened ? setWorkspace(opened) : undefined))
      .catch(() => undefined)
      .finally(() => setBooting(false))
  }, [setWorkspace])

  // Pick up changes made outside Notiva (other editors, iCloud/Syncthing/Git).
  useEffect(() => {
    if (!ws) return
    const reload = () => void ws.reload().catch(() => undefined)
    const bridge = electronBridge()
    if (bridge) return bridge.onVaultChange(reload)
    if (ws.vault.kind !== 'directory') return
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [ws])

  if (booting) return <Spinner label={t('common.loading')} />
  if (!ws) return <WelcomeScreen />

  return (
    <AppShell
      overlays={
        <>
          {searchOpen && <SearchDialog />}
          {newPageOpen && <NewPageDialog />}
        </>
      }
    >
      {route.name === 'page' ? (
        <PageView key={route.path} path={route.path} />
      ) : route.name === 'tag' ? (
        <TagScreen tag={route.tag} />
      ) : route.name === 'trash' ? (
        <TrashScreen />
      ) : route.name === 'settings' ? (
        <SettingsScreen />
      ) : route.name === 'templates' ? (
        <TemplatesScreen />
      ) : route.name === 'moodle' ? (
        route.course ? (
          <CourseScreen key={route.course} courseId={route.course} />
        ) : (
          <MoodleScreen />
        )
      ) : route.name === 'grades' ? (
        <GradesScreen />
      ) : route.name === 'semester' ? (
        <SemesterScreen />
      ) : route.name === 'file' ? (
        <FileScreen key={route.path} path={route.path} {...(route.page ? { page: route.page } : {})} />
      ) : (
        <HomeScreen />
      )}
    </AppShell>
  )
}
