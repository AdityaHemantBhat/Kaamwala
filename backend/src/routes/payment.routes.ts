import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinVersion } from '../middleware/version.middleware';

const router = Router();

router.use(requireMinVersion());

router.post('/create-order', authenticate, paymentController.createOrder);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.post('/pay-via-wallet', authenticate, paymentController.payViaWallet);
router.get('/callback', paymentController.callback);
router.get('/transactions', authenticate, paymentController.getTransactions);
router.post('/add-money', authenticate, paymentController.addMoney);
router.post('/verify-wallet-topup', authenticate, paymentController.verifyWalletTopup);
router.post('/withdraw', authenticate, paymentController.withdraw);

export default router;