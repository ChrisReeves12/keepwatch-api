import { cloudEvent } from '@google-cloud/functions-framework';
import { processLogIngestion } from './log-ingestion-function';
import { processLogAlarmFunction } from './log-alarm-function';

// Register the Cloud Functions with the Functions Framework
// The function names will be used during deployment
cloudEvent('processLogIngestion', processLogIngestion);
cloudEvent('processLogAlarmFunction', processLogAlarmFunction);

