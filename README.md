# NBA AI Avatar Swap

An AI-powered application for swapping NBA player bodies with user videos using advanced computer vision and generative AI.

## Features

- **Video Upload & Processing** - Upload NBA player clips and user videos
- **Body Detection** - Detect and track bodies in video frames using AI
- **Avatar Management** - Store and manage NBA player avatars
- **AI Body Swap** - Generate realistic body swaps using Kling AI and Replicate APIs
- **Real-time Processing** - Stream processing with progress updates
- **Frame Analysis** - Extract and analyze video frames

## Tech Stack

- **Frontend:** Next.js 16 + React 19 with TypeScript
- **Styling:** TailwindCSS + Radix UI
- **Video Processing:** FFmpeg + Fluent-FFmpeg
- **AI/ML Services:**
  - Replicate API (object detection, SAM segmentation, BoT-SORT tracking)
  - Kling AI (video generation and body swap)
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **Deployment:** Ready for Vercel, Docker, or self-hosted

## Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- FFmpeg installed locally (`brew install ffmpeg`)
- API Keys for:
  - Supabase
  - Replicate
  - Kling AI

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd avatar-app-ui
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

4. Add your API keys to `.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# AI Services
REPLICATE_API_TOKEN=your_replicate_token
KLING_ACCESS_KEY=your_kling_access_key
KLING_SECRET_KEY=your_kling_secret_key
```

5. Run development server:
```bash
npm run dev
# or
pnpm dev
```

Visit `http://localhost:3000` to see the app.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/videos` | POST/GET | Upload and manage videos |
| `/api/videos/[id]/frames` | GET | Extract frames from video |
| `/api/detection` | POST/GET | Detect bodies in frames |
| `/api/swap` | POST/GET | Perform body swap operation |
| `/api/analysis` | POST/GET | Analyze video and frames |
| `/api/replacement` | POST/GET | Replace body segments |
| `/api/avatars` | POST/GET | Manage NBA player avatars |

## Workflow

1. **Upload Video** - User uploads NBA player clip
2. **Extract Frames** - System extracts frames from video
3. **Detect Bodies** - AI detects and segments bodies
4. **Analyze** - Scene detection and quality analysis
5. **Generate Swap** - Kling AI generates swapped video
6. **Return Result** - Processed video sent to user

## Environment Variables

See `.env.local.example` for all available configuration options.

## Building for Production

```bash
npm run build
npm run start
```

## Deployment

### Vercel (Recommended)
```bash
vercel deploy
```

### Docker
```bash
docker build -t nba-swap .
docker run -p 3000:3000 nba-swap
```

### Self-hosted
Standard Node.js application. Deploy to any Node.js hosting (Railway, Render, Heroku, etc.)

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
