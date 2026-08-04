import { Router } from 'express';
import { addressController } from '../controllers/address.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { createAddressSchema } from '../validators';

const router = Router();

router.get('/', authenticate, addressController.getAddresses);
router.post('/', authenticate, validateRequest(createAddressSchema), addressController.createAddress);
router.delete('/:id', authenticate, addressController.deleteAddress);
router.patch('/:id/default', authenticate, addressController.setDefault);

export default router;
