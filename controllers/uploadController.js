import dotenv from 'dotenv';
import cloudinary from '../helpers/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

dotenv.config();

const outputDir = path.resolve('/app/descargas');

// Asegura que el directorio de salida exista
if (!fs.existsSync(outputDir)) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✅ Directorio de descargas creado: ${outputDir}`);
  } catch (mkDirErr) {
    console.error(`❌ Error al crear el directorio de descargas ${outputDir}:`, mkDirErr);
  }
}

// Aquí puedes cambiar el navegador que usas para extraer cookies, ej. 'chrome', 'firefox', 'edge'
const BROWSER_NAME = process.env.BROWSER_NAME || 'chrome';

async function getTitle(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--cookies-from-browser', BROWSER_NAME,
      '--get-title',
      url
    ]);

    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        console.error(`yt-dlp cerró con código ${code}`);
        console.error(`yt-dlp STDERR: ${errorOutput}`);
        if (errorOutput.includes("Sign in to confirm you’re not a bot") || errorOutput.includes("FAQ#how-do-i-pass-cookies-to-yt-dlp")) {
          reject(new Error('ACCESO_DENEGADO_AUTH_REQUIRED'));
        } else {
          reject(new Error('FALLO_OBTENER_TITULO'));
        }
      }
    });

    ytdlp.on('error', (err) => {
      console.error('Error al ejecutar yt-dlp para obtener título:', err);
      reject(new Error('FALLO_SPAWN_YTDLP'));
    });
  });
}

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
    console.log(`🎵 Obteniendo título del video: ${url}`);
    const titleRaw = await getTitle(url);
    const title = titleRaw.replace(/[^a-zA-Z0-9-_ ]/g, '');
    outputFile = path.join(outputDir, `${title}.mp3`);
    console.log(`🎵 Título: "${title}", archivo: ${outputFile}`);

    const ytdlp = spawn('yt-dlp', [
      '--cookies-from-browser', BROWSER_NAME,
      '-x',
      '--audio-format', 'mp3',
      '-o', outputFile,
      url
    ]);

    ytdlp.stderr.on('data', (data) => {
      console.error(`⚠️ yt-dlp STDERR: ${data.toString().trim()}`);
    });

    await new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => {
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

    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
      throw new Error('ARCHIVO_DESCARGADO_INVALIDO');
    }

    const result = await cloudinary.uploader.upload(outputFile, {
      resource_type: 'video',
      folder: folderName,
      public_id: title,
      use_filename: true,
      unique_filename: false,
      overwrite: false,
    });

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

    if (err.message === 'ACCESO_DENEGADO_AUTH_REQUIRED') {
      errorMessage = 'Este video requiere autenticación. Las cookies podrían estar caducadas o inválidas.';
      statusCode = 403;
    } else if (err.message === 'FALLO_OBTENER_TITULO') {
      errorMessage = 'No se pudo obtener el título del video.';
    } else if (err.message === 'FALLO_DESCARGA_YTDLP') {
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

// El resto del código (uploadSong, getSongs) igual que antes, sin cambios
export const uploadSong = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos' });
    }

    const user = req.usuario;
    const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
    const folderName = `music-player/${safeName}_${user.id}`;

    const uploads = await Promise.all(req.files.map(async (file) => {
      const originalName = path.parse(file.originalname).name;

      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: 'video',
        folder: folderName,
        public_id: originalName,
        use_filename: true,
        unique_filename: false,
        overwrite: false,
      });

      fs.unlinkSync(file.path);

      return {
        secure_url: result.secure_url,
        title: file.originalname
      };
    }));

    res.json(uploads);
  } catch (err) {
    console.error('❌ Error en uploadSong:', err);
    res.status(500).json({ error: 'Error al subir los archivos' });
  }
};

export const getSongs = async (req, res) => {
  try {
    const user = req.usuario;
    const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
    const folderName = `music-player/${safeName}_${user.id}`;

    const result = await cloudinary.search
      .expression(`folder:${folderName}`)
      .sort_by('created_at', 'desc')
      .max_results(30)
      .execute();

    const songs = result.resources.map(song => ({
      title: song.filename,
      secure_url: song.secure_url
    }));

    res.json(songs);
  } catch (err) {
    console.error('❌ Error al obtener canciones:', err);
    res.status(500).json({ error: 'Error al obtener canciones.' });
  }
};
