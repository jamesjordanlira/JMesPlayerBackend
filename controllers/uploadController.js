import dotenv from 'dotenv';
import cloudinary from '../helpers/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

dotenv.config();

const outputDir = path.resolve('/app/descargas');
if (!fs.existsSync(outputDir)) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✅ Directorio de descargas creado: ${outputDir}`);
  } catch (mkDirErr) {
    console.error(`❌ Error al crear el directorio de descargas ${outputDir}:`, mkDirErr);
  }
}

const COOKIES_PATH = process.env.COOKIES_PATH || '/app/cookies.txt';

async function initializeCookiesCheck() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`--- INICIO DIAGNÓSTICO COOKIES ---`);
  console.log(`DEBUG: Valor de COOKIES_PATH: "${COOKIES_PATH}"`);

  if (!fs.existsSync(COOKIES_PATH)) {
    console.error(`❌ Error: El archivo de cookies no existe en: ${COOKIES_PATH}`);
    throw new Error(`CRITICAL: Archivo de cookies no encontrado en: ${COOKIES_PATH}`);
  } else {
    console.log(`✅ El archivo de cookies existe en: ${COOKIES_PATH}`);
  }

  console.log(`--- FIN DIAGNÓSTICO COOKIES ---`);
}

initializeCookiesCheck().catch(err => {
  console.error('❌ Fallo crítico en la verificación inicial de cookies:', err.message);
});

export const downloadAndUploadSong = async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL requerida' });
  }

  const user = req.usuario;
  const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
  const folderName = `music-player/${safeName}_${user.id}`;

  let outputFile = null;

  try {
    if (!fs.existsSync(COOKIES_PATH)) {
      return res.status(500).json({ error: 'Configuración de cookies no encontrada en el servidor.' });
    }

    console.log(`🎵 Descargando y convirtiendo audio del video: ${url}`);

    const ytdlp = spawn('yt-dlp', [
      '--cookies', COOKIES_PATH,
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5', // Más rápido, calidad decente
      '-o', path.join(outputDir, '%(title)s.%(ext)s'),
      url
    ]);

    ytdlp.stderr.on('data', (data) => {
      console.error(`⚠️ yt-dlp STDERR: ${data.toString().trim()}`);
    });

    console.time('yt-dlp-download');
    await new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => {
        console.timeEnd('yt-dlp-download');
        if (code !== 0) {
          return reject(new Error('FALLO_DESCARGA_YTDLP'));
        }
        resolve();
      });

      ytdlp.on('error', (err) => {
        console.error('Error al iniciar yt-dlp:', err);
        reject(new Error('FALLO_SPAWN_YTDLP'));
      });
    });

    // Buscar el archivo mp3 generado
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.mp3'));
    if (files.length === 0) {
      throw new Error('ARCHIVO_DESCARGADO_INVALIDO');
    }

    outputFile = path.join(outputDir, files[0]);
    const title = path.parse(outputFile).name;

    if (fs.statSync(outputFile).size === 0) {
      throw new Error('ARCHIVO_DESCARGADO_INVALIDO');
    }

    console.log(`🎵 Archivo descargado: ${outputFile}`);

    console.time('cloudinary-upload');
    const result = await cloudinary.uploader.upload(outputFile, {
      resource_type: 'auto', // Mejor que 'video' para mp3
      folder: folderName,
      public_id: title,
      use_filename: true,
      unique_filename: false,
      overwrite: false
    });
    console.timeEnd('cloudinary-upload');

    fs.unlinkSync(outputFile);
    console.log(`🗑️ Archivo local eliminado: ${outputFile}`);

    res.json({
      secure_url: result.secure_url,
      title: result.public_id
    });

  } catch (err) {
    console.error('❌ Error en downloadAndUploadSong:', err);

    let errorMessage = 'Error inesperado al procesar la solicitud.';
    let statusCode = 500;

    if (err.message === 'FALLO_DESCARGA_YTDLP') {
      errorMessage = 'Error al descargar el audio.';
    } else if (err.message === 'FALLO_SPAWN_YTDLP') {
      errorMessage = 'No se pudo iniciar el proceso yt-dlp.';
    } else if (err.message === 'ARCHIVO_DESCARGADO_INVALIDO') {
      errorMessage = 'El archivo descargado está vacío o corrupto.';
    }

    if (outputFile && fs.existsSync(outputFile)) {
      try {
        fs.unlinkSync(outputFile);
        console.log(`🗑️ Archivo eliminado tras error: ${outputFile}`);
      } catch (e) {
        console.error(`❌ No se pudo eliminar el archivo tras error: ${outputFile}`, e);
      }
    }

    res.status(statusCode).json({ error: errorMessage });
  }
};
