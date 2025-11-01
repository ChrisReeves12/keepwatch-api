import { http, cloudEvent } from '@google-cloud/functions-framework';
import { processLogIngestion } from './log-ingestion-function';

// Register the Cloud Function with the Functions Framework
// The function name 'processLogIngestion' will be used during deployment
cloudEvent('processLogIngestion', processLogIngestion);

