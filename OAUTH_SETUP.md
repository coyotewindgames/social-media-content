# Social Media OAuth Integration Guide

This document provides comprehensive instructions for setting up OAuth authentication with Instagram, TikTok, Facebook, Twitter, and YouTube for the Content Planner application.

## Overview

The application uses OAuth 2.0 authorization flows to securely connect users' social media accounts. Each platform has its own authentication requirements and developer portal.

## Architecture

### Components

- **`src/lib/social-api.ts`**: Core OAuth and API integration logic
- **`src/components/AccountsDialog.tsx`**: UI for managing social media accounts  
- **`src/components/OAuthCallback.tsx`**: Handles OAuth redirect callbacks
- **`src/lib/types.ts`**: TypeScript types for social accounts and API responses

### OAuth Flow

1. User clicks "Connect Account" for a platform
2. `SocialMediaAPI.initiateOAuth()` generates OAuth URL with state/PKCE
3. User is redirected to platform's authorization page in new window
4. User authorizes the application
5. Platform redirects back to `/auth/callback` with authorization code
6. `SocialMediaAPI.handleCallback()` exchanges code for access token
7. User profile is fetched and account is saved to local storage
8. OAuth window closes and account appears as connected

## Platform Setup Instructions

### 1. Instagram (via Facebook/Meta)

Instagram uses the Facebook OAuth system.

**Steps:**
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing app
3. Add "Instagram Basic Display" or "Instagram Graph API" product
4. Configure OAuth Redirect URI: `https://yourdomain.com/auth/callback`
5. Add required permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`

**Environment Variables:**
```bash
VITE_INSTAGRAM_CLIENT_ID=your_facebook_app_id
VITE_INSTAGRAM_CLIENT_SECRET=your_facebook_app_secret
```

**API Endpoints:**
- Auth URL: `https://api.instagram.com/oauth/authorize`
- Token URL: `https://api.instagram.com/oauth/access_token`  
- User Info: `https://graph.instagram.com/me`

**Documentation:**
- [Instagram Basic Display API](https://developers.facebook.com/docs/instagram-basic-display-api)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)

---

### 2. Facebook

**Steps:**
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app (Business type recommended)
3. Add "Facebook Login" product
4. Configure OAuth Redirect URI: `https://yourdomain.com/auth/callback`
5. Add required permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
   - `public_profile`

**Environment Variables:**
```bash
VITE_FACEBOOK_CLIENT_ID=your_facebook_app_id
VITE_FACEBOOK_CLIENT_SECRET=your_facebook_app_secret
```

**API Endpoints:**
- Auth URL: `https://www.facebook.com/v18.0/dialog/oauth`
- Token URL: `https://graph.facebook.com/v18.0/oauth/access_token`
- User Info: `https://graph.facebook.com/me`

**Documentation:**
- [Facebook Login](https://developers.facebook.com/docs/facebook-login)
- [Pages API](https://developers.facebook.com/docs/pages-api)

---

### 3. Twitter (X)

Twitter uses OAuth 2.0 with PKCE (Proof Key for Code Exchange).

**Steps:**
1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new project and app
3. Enable OAuth 2.0
4. Add Callback URL: `https://yourdomain.com/auth/callback`
5. Configure app permissions:
   - Read and Write tweets
   - Read user profile

**Environment Variables:**
```bash
VITE_TWITTER_CLIENT_ID=your_twitter_client_id
VITE_TWITTER_CLIENT_SECRET=your_twitter_client_secret
```

**API Endpoints:**
- Auth URL: `https://twitter.com/i/oauth2/authorize`
- Token URL: `https://api.twitter.com/2/oauth2/token`
- User Info: `https://api.twitter.com/2/users/me`

**Special Requirements:**
- Requires PKCE (code_challenge/code_verifier)
- Supports refresh tokens with `offline.access` scope

**Documentation:**
- [Twitter OAuth 2.0](https://developer.twitter.com/en/docs/authentication/oauth-2-0)
- [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)

---

### 4. TikTok

**Steps:**
1. Go to [TikTok Developers](https://developers.tiktok.com/)
2. Create a new app
3. Add "Login Kit" capability
4. Configure Redirect URL: `https://yourdomain.com/auth/callback`
5. Request scopes:
   - `video.publish`
   - `user.info.basic`
   - `user.info.profile`

**Environment Variables:**
```bash
VITE_TIKTOK_CLIENT_ID=your_tiktok_client_key
VITE_TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
```

**API Endpoints:**
- Auth URL: `https://www.tiktok.com/v2/auth/authorize`
- Token URL: `https://open.tiktokapis.com/v2/oauth/token`
- User Info: `https://open.tiktokapis.com/v2/user/info`

**Documentation:**
- [TikTok Login Kit](https://developers.tiktok.com/doc/login-kit-web)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)

---

### 5. YouTube (via Google)

YouTube uses Google's OAuth 2.0 system.

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials (Web application)
5. Add Authorized redirect URI: `https://yourdomain.com/auth/callback`
6. Configure OAuth consent screen
7. Add scopes:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
   - `https://www.googleapis.com/auth/userinfo.profile`

**Environment Variables:**
```bash
VITE_YOUTUBE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_YOUTUBE_CLIENT_SECRET=your_google_client_secret
```

**API Endpoints:**
- Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token URL: `https://oauth2.googleapis.com/token`
- User Info: `https://www.googleapis.com/youtube/v3/channels`

**Special Requirements:**
- Requires OAuth consent screen configuration
- `access_type=offline` for refresh tokens
- `prompt=consent` to force consent screen

**Documentation:**
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [YouTube Data API](https://developers.google.com/youtube/v3)

---

## Local Development Setup

### 1. Create `.env.local` file

```bash
# Instagram (via Facebook)
VITE_INSTAGRAM_CLIENT_ID=your_facebook_app_id
VITE_INSTAGRAM_CLIENT_SECRET=your_facebook_app_secret

# Facebook
VITE_FACEBOOK_CLIENT_ID=your_facebook_app_id
VITE_FACEBOOK_CLIENT_SECRET=your_facebook_app_secret

# Twitter
VITE_TWITTER_CLIENT_ID=your_twitter_client_id
VITE_TWITTER_CLIENT_SECRET=your_twitter_client_secret

# TikTok
VITE_TIKTOK_CLIENT_ID=your_tiktok_client_key
VITE_TIKTOK_CLIENT_SECRET=your_tiktok_client_secret

# YouTube (Google)
VITE_YOUTUBE_CLIENT_ID=your_google_client_id
VITE_YOUTUBE_CLIENT_SECRET=your_google_client_secret
```

### 2. Configure Redirect URLs

For local development, add these redirect URIs to each platform:
- `http://localhost:5173/auth/callback`
- `http://localhost:3000/auth/callback`

For production:
- `https://yourdomain.com/auth/callback`

### 3. Test OAuth Flow

1. Start the development server: `npm run dev`
2. Click "Accounts" button
3. Click on a platform to connect
4. Authorize the application in the popup window
5. Window should close and account should appear as connected

---

## Security Considerations

### State Parameter
- Random state token prevents CSRF attacks
- Stored in `spark.kv` with 10-minute expiration
- Validated on callback

### PKCE (for Twitter)
- Code verifier generated using cryptographically secure random values
- Code challenge created using SHA-256 hash
- Prevents authorization code interception attacks

### Token Storage
- Access tokens stored in local browser storage via `spark.kv`
- Refresh tokens stored for automatic token renewal
- Token expiration tracked and accounts marked as "expired" when needed

### Recommendations
- **Never commit** `.env.local` or credentials to version control
- Use different OAuth apps for development and production
- Rotate client secrets regularly
- Implement proper token refresh logic before expiration
- Consider backend API for sensitive token exchanges in production

---

## API Methods Reference

### `SocialMediaAPI.initiateOAuth(platform: Platform)`
Opens OAuth authorization window for specified platform.

### `SocialMediaAPI.handleCallback(code: string, state: string)`
Exchanges authorization code for access token and returns user data.

### `SocialMediaAPI.getUserProfile(platform: Platform, accessToken: string)`  
Fetches user profile information.

### `SocialMediaAPI.refreshAccessToken(platform: Platform, refreshToken: string)`
Refreshes expired access token using refresh token.

### `SocialMediaAPI.postContent(platform, account, postData)`
Posts content to the specified platform.

### `SocialMediaAPI.validateAccount(account: SocialAccount)`
Checks if account has valid, non-expired credentials.

---

## Platform Posting Limits

```typescript
const limits = {
  instagram: {
    maxCaptionLength: 2200,
    supportsImages: true,
    supportsVideos: true,
    maxVideoSizeMB: 100,
  },
  facebook: {
    maxCaptionLength: 63206,
    supportsImages: true,
    supportsVideos: true,
    maxVideoSizeMB: 4000,
  },
  twitter: {
    maxCaptionLength: 280,
    supportsImages: true,
    supportsVideos: true,
    maxVideoSizeMB: 512,
  },
  tiktok: {
    maxCaptionLength: 2200,
    supportsImages: false,
    supportsVideos: true,
    maxVideoSizeMB: 287,
  },
  youtube: {
    maxCaptionLength: 5000,
    supportsImages: false,
    supportsVideos: true,
    maxVideoSizeMB: 128000,
  },
}
```

---

## Troubleshooting

### "Invalid OAuth state" Error
- State token expired (> 10 minutes)
- State token not found in storage
- **Solution**: Restart OAuth flow

### "Redirect URI mismatch" Error  
- Callback URL doesn't match configured URL in developer portal
- **Solution**: Verify redirect URI matches exactly (including protocol, port)

### "Insufficient permissions" Error
- App doesn't have required scopes
- **Solution**: Add missing scopes in developer portal and re-authorize

### Token Refresh Failures
- Refresh token expired or revoked
- **Solution**: User must re-authorize the application

### CORS Errors
- OAuth flow should happen in popup window, not main window
- **Solution**: Verify `window.open()` is being used

---

## Production Deployment Checklist

- [ ] Replace all redirect URIs with production URLs
- [ ] Add production URLs to each platform's developer portal
- [ ] Set environment variables in hosting platform
- [ ] Remove demo/test credentials
- [ ] Submit apps for review if required (Facebook, TikTok)
- [ ] Implement proper error tracking (Sentry, etc.)
- [ ] Set up monitoring for token expiration
- [ ] Consider backend service for sensitive operations
- [ ] Implement rate limiting to respect API quotas
- [ ] Add proper logging for OAuth flows

---

## Additional Resources

- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)
- [PKCE RFC](https://datatracker.ietf.org/doc/html/rfc7636)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

## Support

For questions or issues:
1. Check platform-specific documentation links above
2. Review console logs for detailed error messages  
3. Verify environment variables are set correctly
4. Ensure redirect URIs match exactly in developer portals
