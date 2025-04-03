# PainPoint

PainPoint is a web application that serves as a CRM for startup discovery calls, with an AI-powered copilot that processes meeting recordings to generate transcripts, identify pain points, and map out insights across multiple conversations.

## Features

- **Contact Management:** Add, edit, and manage contacts and companies
- **Meeting Management:** Schedule meetings, upload recordings, and take notes
- **AI-Powered Analysis:**
  - Transcribe meeting recordings using OpenAI
  - Extract pain points and their root causes
  - Identify patterns across multiple conversations
- **Insights Dashboard:** Visualize common pain points and understand customer needs

## Technology Stack

- Next.js 15
- React 19
- TypeScript
- Supabase (PostgreSQL database, authentication, and storage)
- OpenAI API (for transcription and analysis)
- Shadcn/UI for components

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- OpenAI API key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/painpoint.git
cd painpoint
```

2. Install dependencies:

```bash
npm install
# or
pnpm install
```

3. Create a `.env.local` file with your Supabase configuration (see `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. Run the development server:

```bash
npm run dev
# or
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Database Setup

1. Create a new project in Supabase
2. Use the SQL in `supabase/schema.sql` to set up your database schema
3. Create a storage bucket called "recordings" for audio files

## Usage

1. Sign up for an account
2. Add your OpenAI API key in the settings
3. Create contacts and companies
4. Schedule meetings
5. Upload recordings and generate transcripts
6. Analyze conversations to extract pain points
7. View insights across multiple meetings

## License

MIT 