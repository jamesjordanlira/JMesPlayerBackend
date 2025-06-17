import express from 'express';
// importar rutas:
import {
    registerUser,
    confirmAccount,
    forgetPassword,
    newPassword,
    validateToken,
    profile,
    authenticate
} from '../controllers/userController.js';
import checkAuth from '../middlewares/checkAuth.js';

const router = express.Router();
router.post('/register-user', registerUser);
router.get('/confirm-account/:token', confirmAccount);
router.post('/forget-password/', forgetPassword);
// .route es para cuando tenemos 2 rutas con el mismo nombre y solo cambia el verbo
router.route('/forget-password/:token').get(validateToken).post(newPassword);
router.post('/login', authenticate);
router.get('/profile', checkAuth, profile);


export default router;
