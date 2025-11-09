import dotenv from 'dotenv';

import { createSystemAdmin } from "../services/system-admins.service";
import { SystemAdminRole } from "../types/subscription.types";
import {connectToFirestore} from "../database/firestore.connection";

dotenv.config();

async function createSystemAdminFromCli() {
    const name = (process.argv[2] || '').trim();
    const email = (process.argv[3] || '').trim().toLowerCase();
    const password = (process.argv[4] || '').trim();
    const role = (process.argv[5] || '').trim() as SystemAdminRole;

    if (!name) {
        console.error('A name for the system admin is required.');
        return 1;
    }

    if (!email) {
        console.error('An email for the system admin is required.');
        return 1;
    }

    if (!password) {
        console.error('A password for the system admin is required.');
        return 1;
    }

    if (!['superadmin', 'editor', 'viewer'].includes(role)) {
        console.error("Role must be 'superuser', 'editor' or 'viewer'.");
        return 1;
    }

    await connectToFirestore();

    const result = await createSystemAdmin({
        name, email, password, role
    });

    console.log('System Admin Created', result);
    return 0;
}

createSystemAdminFromCli().then();
