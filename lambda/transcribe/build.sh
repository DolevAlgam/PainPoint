#!/bin/bash

# Make the prepare-ffmpeg script executable
chmod +x prepare-ffmpeg.sh

# Run the prepare-ffmpeg script
./prepare-ffmpeg.sh

# Install dependencies
npm install

# Build TypeScript
npm run build

# Create the deployment package
zip -r ../transcribe.zip . -x "*.git*" "*.ts" "*.tsx" "*.sh" "node_modules/typescript/*" 