import { Router } from 'express';

import * as SystemController from '../controllers/system.controller';
import {
    authenticateSystemAdmin,
    requireSystemAdminRole,
} from '../middleware/system-admin-auth.middleware';

const router = Router();

router.use(authenticateSystemAdmin);

router.post(
    '/subscription-plans',
    requireSystemAdminRole('superadmin', 'superuser', 'editor'),
    SystemController.createPlan,
);

router.get('/subscription-plans', SystemController.listSubscriptionPlans);

router.put(
    '/subscription-plans/:machineName',
    requireSystemAdminRole('superadmin', 'superuser', 'editor'),
    SystemController.updateSubscriptionPlan,
);

router.delete(
    '/subscription-plans/:machineName',
    requireSystemAdminRole('superadmin', 'superuser', 'editor'),
    SystemController.deleteSubscriptionPlan,
);

export default router;

