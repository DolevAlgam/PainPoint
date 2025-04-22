#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { PainpointLambdaStack } from '../lib/painpoint-lambda-stack';

const app = new cdk.App();
new PainpointLambdaStack(app, 'PainpointLambdaStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
}); 