import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { issueController } from '../controllers/issue.controller';

const router = Router();

// Public (authenticated) endpoints
router.get('/:category', authenticate, issueController.listByCategory);
router.get('/scope/:issueId', authenticate, issueController.getScope);
router.post('/run-promotion', authenticate, issueController.runPromotion);

// Admin issue management
router.get('/admin/list', authenticate, requireRole('ADMIN'), issueController.adminList);
router.get('/admin/candidates', authenticate, requireRole('ADMIN'), issueController.adminListCandidates);
router.get('/admin/config', authenticate, requireRole('ADMIN'), issueController.getConfig);
router.put('/admin/config', authenticate, requireRole('ADMIN'), issueController.putConfig);
router.post('/admin/create', authenticate, requireRole('ADMIN'), issueController.adminCreateIssue);
router.patch('/admin/:id/lifecycle', authenticate, requireRole('ADMIN'), issueController.adminUpdateLifecycle);
router.post('/admin/merge', authenticate, requireRole('ADMIN'), issueController.adminMergeIssue);
router.post('/admin/resolve-candidate', authenticate, requireRole('ADMIN'), issueController.adminResolveCandidate);

export default router;
