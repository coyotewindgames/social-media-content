import { useEffect, useState } from 'react'
import { SocialMediaAPI } from '@/lib/social-api'
import { CircleNotch } from '@phosphor-icons/react'

export function OAuthCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Processing OAuth callback...')

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const state = urlParams.get('state')
      const error = urlParams.get('error')

      if (error) {
        setStatus('error')
        setMessage(`Authorization failed: ${error}`)
        setTimeout(() => window.close(), 3000)
        return
      }

      if (!code || !state) {
        setStatus('error')
        setMessage('Missing authorization code or state')
        setTimeout(() => window.close(), 3000)
        return
      }

      try {
        const result = await SocialMediaAPI.handleCallback(code, state)
        setStatus('success')
        setMessage(`Successfully authorized ${result.platform}! You can close this window.`)
        
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'oauth-success',
              platform: result.platform,
              code,
              state,
            },
            window.location.origin
          )
        }
        
        setTimeout(() => window.close(), 2000)
      } catch (error) {
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Authentication failed')
        setTimeout(() => window.close(), 3000)
      }
    }

    handleCallback()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10">
      <div className="bg-card p-8 rounded-2xl shadow-lg max-w-md w-full mx-4">
        <div className="flex flex-col items-center text-center gap-4">
          {status === 'processing' && (
            <>
              <CircleNotch size={48} className="animate-spin text-primary" />
              <h2 className="text-2xl font-bold">Processing...</h2>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-green-600">Success!</h2>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-red-600">Error</h2>
            </>
          )}
          <p className="text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}
