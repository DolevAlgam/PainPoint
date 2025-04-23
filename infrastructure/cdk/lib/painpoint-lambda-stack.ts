import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export class PainpointLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket for temporary audio storage
    const audioBucket = new s3.Bucket(this, 'PainpointAudioBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(1), // Delete files after 1 day
        },
      ],
    });

    // Create SQS queues
    const transcribeQueue = new sqs.Queue(this, 'TranscribeQueue', {
      visibilityTimeout: cdk.Duration.minutes(15), // Match Lambda timeout
      retentionPeriod: cdk.Duration.days(14),
    });
    
    const analyzeTranscriptQueue = new sqs.Queue(this, 'AnalyzeTranscriptQueue', {
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
    });
    
    const analyzePainPointsQueue = new sqs.Queue(this, 'AnalyzePainPointsQueue', {
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, 'PainpointLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add S3 permissions
    audioBucket.grantReadWrite(lambdaRole);
    
    // Add permissions for SQS
    transcribeQueue.grantConsumeMessages(lambdaRole);
    analyzeTranscriptQueue.grantConsumeMessages(lambdaRole);
    analyzePainPointsQueue.grantConsumeMessages(lambdaRole);

    // Create Lambda functions
    const transcribeLambda = new lambda.Function(this, 'TranscribeLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('../../lambda/transcribe'),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 4096, // 4GB of memory
      role: lambdaRole,
      environment: {
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        AUDIO_BUCKET_NAME: audioBucket.bucketName,
      },
    });
    
    const analyzeTranscriptLambda = new lambda.Function(this, 'AnalyzeTranscriptLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('../../lambda/analyze-transcript'),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048, // 2GB of memory
      role: lambdaRole,
      environment: {
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
    });
    
    const analyzePainPointsLambda = new lambda.Function(this, 'AnalyzePainPointsLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('../../lambda/analyze-common-pain-points'),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048, // 2GB of memory
      role: lambdaRole,
      environment: {
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
    });

    // Add SQS as event sources for Lambda functions
    transcribeLambda.addEventSource(new SqsEventSource(transcribeQueue));
    analyzeTranscriptLambda.addEventSource(new SqsEventSource(analyzeTranscriptQueue));
    analyzePainPointsLambda.addEventSource(new SqsEventSource(analyzePainPointsQueue));

    // Output the queue URLs so they can be used in the Next.js app
    new cdk.CfnOutput(this, 'TranscribeQueueUrl', {
      value: transcribeQueue.queueUrl,
      description: 'URL of the SQS queue for transcript generation',
    });
    
    new cdk.CfnOutput(this, 'AnalyzeTranscriptQueueUrl', {
      value: analyzeTranscriptQueue.queueUrl,
      description: 'URL of the SQS queue for transcript analysis',
    });
    
    new cdk.CfnOutput(this, 'AnalyzePainPointsQueueUrl', {
      value: analyzePainPointsQueue.queueUrl,
      description: 'URL of the SQS queue for pain points analysis',
    });
  }
} 