#!/bin/bash

# Deploy the log alarm Cloud Function to Google Cloud
# This script deploys a Cloud Function (2nd gen) that is triggered by Pub/Sub messages

set -e  # Exit on error

# Function to restore package.json on exit
cleanup() {
    if [ -f "package.json.backup" ]; then
        echo "📝 Restoring original package.json..."
        mv package.json.backup package.json
    fi
}

# Set trap to call cleanup on exit (success or failure)
trap cleanup EXIT

GOOGLE_CLOUD_PROJECT="keep-watch-1"

# Configuration
FUNCTION_NAME="log-alarm-processor"
REGION="us-central1"
RUNTIME="nodejs20"
ENTRY_POINT="processLogAlarmFunction"
TOPIC_NAME="log-alarm"
SOURCE_DIR="."
SERVICE_ACCOUNT="keepwatch-api-sa@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"

# Get project ID from gcloud config if not set
if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
    GOOGLE_CLOUD_PROJECT=$(gcloud config get-value project)
    echo "Using project: $GOOGLE_CLOUD_PROJECT"
fi

echo "🚀 Deploying Cloud Function: $FUNCTION_NAME"
echo "   Region: $REGION"
echo "   Trigger: Pub/Sub topic '$TOPIC_NAME'"
echo "   Entry point: $ENTRY_POINT"
echo ""

# Backup original package.json
echo "📝 Updating package.json for function deployment..."
cp package.json package.json.backup

# Update package.json main field to point to the function entry point
# Using Node.js to safely update the JSON
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.main = 'dist/functions/index.js';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Deploy the function
echo "🚀 Deploying to Google Cloud..."
gcloud functions deploy "$FUNCTION_NAME" \
    --gen2 \
    --runtime="$RUNTIME" \
    --region="$REGION" \
    --source="$SOURCE_DIR" \
    --entry-point="$ENTRY_POINT" \
    --trigger-topic="$TOPIC_NAME" \
    --service-account="$SERVICE_ACCOUNT" \
    --set-secrets="REDIS_HOST=REDIS_HOST:latest,MAILGUN_API_KEY=MAILGUN_API_KEY:latest,MAILGUN_DOMAIN=MAILGUN_DOMAIN:latest,MAILGUN_SENDER_EMAIL=MAILGUN_SENDER_EMAIL:latest" \
    --set-env-vars="WEB_FRONTEND_URL=https://keepwatch.io,GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},REDIS_PORT=6379" \
    --vpc-connector="keepwatch-connector" \
    --memory="512Mi" \
    --timeout="60s" \
    --max-instances="100" \
    --min-instances="0" \
    --allow-unauthenticated \
    --retry

echo ""
echo "✅ Log Alarm Function Deployment complete!"
echo ""
echo "To view logs, run:"
echo "  gcloud functions logs read $FUNCTION_NAME --region=$REGION --gen2 --limit=50"
echo ""
echo "To test the function, publish a message to the topic:"
echo "  gcloud pubsub topics publish $TOPIC_NAME --message='{\"logData\":{\"level\":\"error\",\"message\":\"Test error\"},\"logId\":\"test-log-id\"}'"
