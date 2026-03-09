import { useState } from 'react'
import { PipelineDashboard } from '@/components/PipelineDashboard'
import { RunHistory } from '@/components/RunHistory'
import { AccountsDialog } from '@/components/AccountsDialog'
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard'
import { AutoDiscoverySettingsDialog } from '@/components/AutoDiscoverySettingsDialog'
import { useAutoDiscovery } from '@/hooks/use-auto-discovery'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Lightning, User, Gear, Bell, ChartLine, Play, ClockCounterClockwise } from '@phosphor-icons/react'
import { Toaster } from 'sonner'

function App() {
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false)
  const [autoDiscoverySettingsOpen, setAutoDiscoverySettingsOpen] = useState(false)
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false)

  const { settings: autoDiscoverySettings, updateSettings: updateAutoDiscoverySettings } = useAutoDiscovery()

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      <div className="bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
                <Lightning size={36} weight="duotone" className="text-primary" />
                Content Pipeline
              </h1>
              <p className="text-muted-foreground text-lg">
                Generate, preview, and compare AI-driven social content
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setAnalyticsDialogOpen(true)}
                variant="outline"
                size="lg"
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <ChartLine size={20} weight="duotone" className="mr-2" />
                Analytics
              </Button>
              <Button
                onClick={() => setAutoDiscoverySettingsOpen(true)}
                variant="outline"
                size="lg"
                className="relative"
              >
                <Gear size={20} weight="duotone" className="mr-2" />
                Settings
                {autoDiscoverySettings.enabled && (
                  <Badge
                    variant="default"
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-green-500 border-2 border-background"
                  >
                    <Bell size={12} weight="fill" className="text-white" />
                  </Badge>
                )}
              </Button>
              <Button
                onClick={() => setAccountsDialogOpen(true)}
                variant="outline"
                size="lg"
              >
                <User size={20} weight="duotone" className="mr-2" />
                Accounts
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" className="gap-1.5">
              <Play size={16} weight="duotone" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <ClockCounterClockwise size={16} weight="duotone" />
              Run History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <PipelineDashboard />
          </TabsContent>
          <TabsContent value="history">
            <RunHistory />
          </TabsContent>
        </Tabs>
      </div>

      <AccountsDialog open={accountsDialogOpen} onClose={() => setAccountsDialogOpen(false)} />

      <AutoDiscoverySettingsDialog
        open={autoDiscoverySettingsOpen}
        onClose={() => setAutoDiscoverySettingsOpen(false)}
        settings={autoDiscoverySettings}
        onSave={updateAutoDiscoverySettings}
      />

      <AnalyticsDashboard
        open={analyticsDialogOpen}
        onClose={() => setAnalyticsDialogOpen(false)}
      />
    </div>
  )
}

export default App