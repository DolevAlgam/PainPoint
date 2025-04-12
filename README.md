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

## AWS Lambda Setup

This application uses AWS Lambda for resource-intensive operations:

1. **Transcribe API**: Transcription of audio recordings
2. **Analyze Transcript API**: Analysis of transcriptions to identify pain points
3. **Analyze Common Pain Points API**: Aggregation of pain points across meetings

### Infrastructure Setup

1. Set up AWS credentials as GitHub secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

2. Also add Supabase secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. Push changes to trigger GitHub workflow or run manually.

4. Add the deployed SQS queue URLs to your Vercel environment variables:
   - `TRANSCRIBE_QUEUE_URL`
   - `ANALYZE_TRANSCRIPT_QUEUE_URL`
   - `ANALYZE_PAIN_POINTS_QUEUE_URL`

### Local Development

To develop and test locally:

```bash
# Install AWS SDK
npm install aws-sdk --save

# Set up environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-west-2
export TRANSCRIBE_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/...
export ANALYZE_TRANSCRIPT_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/...
export ANALYZE_PAIN_POINTS_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/...
```

## License

MIT 