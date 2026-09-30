import { startService } from '../shared/start-service.ts';

// Synthetic demo data only. No business endpoints are implemented yet.
startService('bank-demo', 3002, process.env.BANK_MONGODB_URI);
