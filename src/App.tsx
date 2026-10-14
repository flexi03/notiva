import { useEffect, useState } from 'react'
import { useApp } from '@/app/store'
import { autoOpen } from '@/app/vaults'
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
      ) : (
        <HomeScreen />
      )}
    </AppShell>
  )
}
