import { useState } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { SocialAccount, Platform } from '@/lib/types'
import { SocialMediaAPI } from '@/lib/social-api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  User,
  Trash,
  ArrowClockwise,
  CheckCircle,
  Warning,
  XCircle,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface AccountsDialogProps {
  open: boolean
  onClose: () => void
}

const platformColors: Record<Platform, string> = {
  instagram: 'from-purple-500 to-pink-500',
  tiktok: 'from-black to-gray-800',
  facebook: 'from-blue-600 to-blue-700',
  twitter: 'from-sky-500 to-sky-600',
  youtube: 'from-red-600 to-red-700',
}

const statusIcons = {
  connected: <CheckCircle size={16} weight="fill" className="text-green-500" />,
  expired: <Warning size={16} weight="fill" className="text-yellow-500" />,
  disconnected: <XCircle size={16} weight="fill" className="text-red-500" />,
  pending: <ArrowClockwise size={16} className="text-blue-500 animate-spin" />,
}

export function AccountsDialog({ open, onClose }: AccountsDialogProps) {
  const [accounts, setAccounts] = useLocalStorage<SocialAccount[]>('social-accounts', [])
  const [connecting, setConnecting] = useState<Platform | null>(null)

  const handleConnectAccount = async (platform: Platform) => {
    setConnecting(platform)
    
    try {
      await SocialMediaAPI.initiateOAuth(platform)
      toast.success(`Opening ${SocialMediaAPI.getPlatformName(platform)} authorization...`)
      
      setTimeout(() => setConnecting(null), 3000)
    } catch (error) {
      toast.error(`Failed to initiate ${platform} OAuth`)
      setConnecting(null)
    }
  }
  
  const handleOAuthComplete = async (code: string, state: string) => {
    try {
      const result = await SocialMediaAPI.handleCallback(code, state)
      const profile = await SocialMediaAPI.getUserProfile(result.platform, result.accessToken)
      
      const newAccount: SocialAccount = {
        id: `account_${Date.now()}`,
        platform: result.platform,
        username: profile.username,
        displayName: profile.displayName,
        profileImageUrl: profile.profileImageUrl,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenExpiresAt: result.expiresIn
          ? new Date(Date.now() + result.expiresIn * 1000).toISOString()
          : undefined,
        status: 'connected',
        lastSyncedAt: new Date().toISOString(),
        connectedAt: new Date().toISOString(),
      }
      
      setAccounts((current) => [...(current || []), newAccount])
      toast.success(`${SocialMediaAPI.getPlatformName(result.platform)} account connected!`)
    } catch (error) {
      toast.error(`Failed to complete OAuth: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDisconnectAccount = (accountId: string) => {
    setAccounts((current) => (current || []).filter((acc) => acc.id !== accountId))
    toast.success('Account disconnected')
  }

  const handleRefreshToken = async (account: SocialAccount) => {
    if (!account.refreshToken) {
      toast.error('No refresh token available')
      return
    }

    try {
      const tokenData = await SocialMediaAPI.refreshAccessToken(
        account.platform,
        account.refreshToken
      )
      
      setAccounts((current) =>
        (current || []).map((acc) =>
          acc.id === account.id
            ? {
                ...acc,
                accessToken: tokenData.accessToken,
                tokenExpiresAt: new Date(
                  Date.now() + tokenData.expiresIn * 1000
                ).toISOString(),
                status: 'connected',
                lastSyncedAt: new Date().toISOString(),
              }
            : acc
        )
      )
      
      toast.success('Access token refreshed!')
    } catch (error) {
      toast.error('Failed to refresh token')
    }
  }

  const availablePlatforms: Platform[] = ['instagram', 'tiktok', 'facebook', 'twitter', 'youtube']
  const connectedPlatforms = new Set((accounts || []).map((acc) => acc.platform))
  const unconnectedPlatforms = availablePlatforms.filter((p) => !connectedPlatforms.has(p))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <User size={28} weight="duotone" className="text-primary" />
            Social Media Accounts
          </DialogTitle>
          <DialogDescription>
            Connect your social media accounts to automate posting. See OAUTH_SETUP.md for detailed setup instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {(accounts || []).length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Connected Accounts</h3>
              <div className="space-y-3">
                <AnimatePresence>
                  {(accounts || []).map((account) => (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                    >
                      <Card className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={account.profileImageUrl} />
                                <AvatarFallback
                                  className={`bg-gradient-to-br ${
                                    platformColors[account.platform]
                                  } text-white`}
                                >
                                  {account.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold truncate">
                                    {account.displayName || account.username}
                                  </p>
                                  <Badge variant="outline" className="text-xs">
                                    {account.platform}
                                  </Badge>
                                  {statusIcons[account.status]}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  @{account.username}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Connected {new Date(account.connectedAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {account.status === 'expired' && account.refreshToken && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRefreshToken(account)}
                                >
                                  <ArrowClockwise size={16} className="mr-1" />
                                  Refresh
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDisconnectAccount(account.id)}
                              >
                                <Trash size={18} />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {unconnectedPlatforms.length > 0 && (
            <>
              {(accounts || []).length > 0 && <Separator />}
              <div>
                <h3 className="font-semibold mb-3">Add New Account</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {unconnectedPlatforms.map((platform) => (
                    <Button
                      key={platform}
                      variant="outline"
                      className="h-auto py-4 flex flex-col items-center gap-2"
                      onClick={() => handleConnectAccount(platform)}
                      disabled={connecting === platform}
                    >
                      <div
                        className={`w-12 h-12 rounded-full bg-gradient-to-br ${platformColors[platform]} flex items-center justify-center text-white font-bold text-xl`}
                      >
                        {platform.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="capitalize">
                        {connecting === platform ? 'Connecting...' : platform}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {(accounts || []).length === 0 && (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <User size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">
                No accounts connected yet. Connect your first social media account to start
                automating your posts!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
