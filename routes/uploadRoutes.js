import express from "express";
import multer from "multer";
import checkAuth from '../middlewares/checkAuth.js';
import { uploadSong, getSongs, downloadAndUploadSong } from '../controllers/uploadController.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Subir archivos locales (protegido)
router.post('/upload', checkAuth, upload.array('file', 10), uploadSong);

// Obtener canciones del usuario (protegido)
router.get('/songs', checkAuth, getSongs);

// Descargar de YouTube y subir (protegido)
router.post('/songs/download', checkAuth, downloadAndUploadSong);

export default router;
