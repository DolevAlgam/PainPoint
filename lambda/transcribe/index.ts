import { SQSEvent, Context } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Initialize AWS services
const s3 = new AWS.S3();
const transcribe = new AWS.TranscribeService();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const handler = async (event: SQSEvent, context: Context) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const { userId, meetingId, recordingId } = JSON.parse(record.body);
      console.log('Processing recording:', { userId, meetingId, recordingId });

      // Get recording info from Supabase
      const { data: recording, error: recordingError } = await supabase
        .from('recordings')
        .select('*')
        .eq('id', recordingId)
        .single();

      if (recordingError) {
        console.error('Error fetching recording:', recordingError);
        throw recordingError;
      }

      // Generate a unique job name for Transcribe
      const jobName = `transcribe-${meetingId}-${recordingId}-${uuidv4()}`;

      // Start transcription job
      const transcribeParams = {
        TranscriptionJobName: jobName,
        LanguageCode: 'en-US',
        Media: {
          MediaFileUri: `s3://${process.env.AUDIO_BUCKET_NAME}/${recording.file_path}`
        },
        OutputBucketName: process.env.AUDIO_BUCKET_NAME,
        OutputKey: `transcripts/${jobName}.json`,
        Settings: {
          ShowSpeakerLabels: true,
          MaxSpeakerLabels: 2
        }
      };

      console.log('Starting transcription job:', jobName);
      await transcribe.startTranscriptionJob(transcribeParams).promise();

      // Update transcript record with job ID
      const { error: updateError } = await supabase
        .from('transcripts')
        .update({
          transcribe_job_id: jobName,
          status: 'processing'
        })
        .eq('recording_id', recordingId);

      if (updateError) {
        console.error('Error updating transcript:', updateError);
        throw updateError;
      }

      console.log('Successfully started transcription job:', jobName);
    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }
}; 