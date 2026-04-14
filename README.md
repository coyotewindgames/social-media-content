# Social Media Content Planner

A powerful social media content planning and creation tool with AI-powered features for generating captions, analyzing trends, and managing multiple social media accounts.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd social-media-content
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file for environment variables:
```bash
# Optional: OpenAI API key for AI features
VITE_OPENAI_API_KEY=your_openai_api_key

# Optional: Social media OAuth credentials (see OAUTH_SETUP.md)
VITE_INSTAGRAM_CLIENT_ID=your_instagram_client_id
VITE_FACEBOOK_CLIENT_ID=your_facebook_client_id
VITE_TWITTER_CLIENT_ID=your_twitter_client_id
VITE_TIKTOK_CLIENT_ID=your_tiktok_client_id
VITE_YOUTUBE_CLIENT_ID=your_youtube_client_id
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 📦 Features

- **Content Planning**: Create, organize, and schedule social media content
- **AI Caption Generation**: Generate engaging captions using AI
- **Trending Topics Discovery**: Find trending topics for content inspiration
- **Multi-Platform Support**: Instagram, TikTok, Facebook, Twitter, YouTube
- **Analytics Dashboard**: Track performance across connected accounts
- **Image Generation**: AI-powered image generation for posts
- **Auto-Discovery**: Automatic content suggestions based on trends

## 🔧 Configuration

### AI Features

To enable AI-powered features (caption generation, trending topics, etc.), set the `VITE_OPENAI_API_KEY` environment variable. Without this, the app will use placeholder responses.

### Social Media Integration

For connecting social media accounts, see [OAUTH_SETUP.md](./OAUTH_SETUP.md) for detailed instructions on setting up OAuth credentials for each platform.

## 🛠️ Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 📁 Project Structure

\`\`\`
src/
├── components/     # React components
├── hooks/          # Custom React hooks
├── lib/            # Utility functions and APIs
├── styles/         # CSS styles
└── App.tsx         # Main application component
\`\`\`

## 📄 License

This project is licensed under the MIT License.

## 📚 Additional Resources

- [OAuth Setup Guide](./OAUTH_SETUP.md)
- [Security Guidelines](./SECURITY.md)
- [Product Requirements](./PRD.md)
