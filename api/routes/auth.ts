import { Router } from 'express';
import * as auth from '../controllers/auth';

const router = Router();

router.post('/signup', auth.createUser);

export default router;

