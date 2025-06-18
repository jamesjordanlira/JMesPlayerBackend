import dotenv from 'dotenv';
import cloudinary from '../helpers/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';

dotenv.config();

// Directorio temporal para almacenar los archivos de audio descargados
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

// Ruta al archivo de cookies.
const COOKIES_PATH = process.env.COOKIES_PATH || '/app/cookies.txt';

// --- INICIO: Lógica para manejar el inicio del servidor con retraso ---
async function initializeCookiesCheck() {
  // Retraso breve para evitar race conditions
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`--- INICIO DIAGNÓSTICO COOKIES ---`);
  console.log(`DEBUG: Valor de COOKIES_PATH: "${COOKIES_PATH}"`);

  try {
    console.log(`DEBUG: Contenido de /tmp/`);
    const tmpContents = fs.readdirSync('/tmp');
    tmpContents.forEach(item => console.log(`DEBUG:   - /tmp/${item}`));
  } catch (lsError) {
    console.error(`DEBUG: Error al listar /tmp/:`, lsError);
  }

  if (!fs.existsSync(COOKIES_PATH)) {
    console.error(`❌ Error (DEBUG): fs.existsSync(${COOKIES_PATH}) devolvió false.`);
    try {
      const parentDir = path.dirname(COOKIES_PATH);
      console.log(`DEBUG: Intentando listar el directorio padre de cookies: ${parentDir}`);
      const parentContents = fs.readdirSync(parentDir);
      parentContents.forEach(item => console.log(`DEBUG:   - ${parentDir}/${item}`));
    } catch (parentDirLsError) {
      console.error(`DEBUG: Error al listar directorio padre de cookies:`, parentDirLsError);
    }
    throw new Error(`CRITICAL: Archivo de cookies no encontrado en: ${COOKIES_PATH}`);
  } else {
    console.log(`✅ DEBUG: fs.existsSync(${COOKIES_PATH}) devolvió true. El archivo existe.`);
    try {
      const cookieContentPreview = fs.readFileSync(COOKIES_PATH, 'utf8').substring(0, 100) + '...';
      console.log(`✅ DEBUG: Contenido de cookies (primeros 100 chars): ${cookieContentPreview}`);
      const cookieStats = fs.statSync(COOKIES_PATH);
      console.log(`✅ DEBUG: Estadísticas de cookies: size=${cookieStats.size}, mode=${cookieStats.mode.toString(8)}`);
    } catch (readErr) {
      console.error(`❌ DEBUG: Error al leer el archivo de cookies ${COOKIES_PATH} (posible problema de permisos):`, readErr);
      throw new Error(`CRITICAL: No se pudo leer el archivo de cookies en: ${COOKIES_PATH} (permisos?)`);
    }
  }
  console.log(`--- FIN DIAGNÓSTICO COOKIES ---`);
}

initializeCookiesCheck().catch(err => {
  console.error('❌ Fallo crítico en la verificación inicial de cookies:', err.message);
  // process.exit(1);
});

// Función para subir canciones ya cargadas
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
      console.log(`🗑️ Archivo temporal eliminado: ${file.path}`);

      return {
        secure_url: result.secure_url,
        title: file.originalname
      };
    }));

    res.json(uploads);
  } catch (err) {
    console.error('❌ Error subiendo a Cloudinary (uploadSong):', err);
    res.status(500).json({ error: 'Error al subir los archivos' });
  }
};

// Función para descargar canción desde URL y subirla
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
      console.error(`❌ Error (runtime check): El archivo de cookies no existe en la ruta: ${COOKIES_PATH}`);
      return res.status(500).json({ error: 'Configuración de cookies no encontrada en el servidor. Contacte al administrador.' });
    }

    // Obtener título con yt-dlp (rápido)
    const getTitleCmd = `yt-dlp --cookies "${COOKIES_PATH}" --get-title "${url}"`;
    console.log(`ℹ️ Ejecutando comando para obtener título: ${getTitleCmd}`);

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(getTitleCmd, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('❌ Error en exec (obtener título):', err);
          console.error('⚠️ STDERR de yt-dlp (get-title):', stderr);
          if (stderr.includes("Sign in to confirm you’re not a bot") || stderr.includes("FAQ#how-do-i-pass-cookies-to-yt-dlp")) {
            return reject(new Error('ACCESO_DENEGADO_AUTH_REQUIRED'));
          }
          return reject(new Error('FALLO_OBTENER_TITULO'));
        }
        resolve({ stdout, stderr });
      });
    });

    const title = stdout.trim().replace(/[^a-zA-Z0-9-_ ]/g, '');
    outputFile = path.join(outputDir, `${title}.mp3`);

    console.log(`🎵 Título obtenido: "${title}". Archivo de salida esperado: ${outputFile}`);
    console.log(`🎵 Iniciando descarga de audio de: ${url}`);

    // Descargar audio con yt-dlp y convertir a mp3
    const ytdlp = spawn('yt-dlp', [
      '--cookies', COOKIES_PATH,
      '-x',
      '--audio-format', 'mp3',
      '-o', outputFile,
      url
    ]);

    ytdlp.stderr.on('data', (data) => {
      console.error(`⚠️ yt-dlp STDERR (descarga): ${data.toString().trim()}`);
    });

    // Promesa para esperar descarga
    const downloadPromise = new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ yt-dlp salió con código de error: ${code}. No se pudo descargar el audio.`);
          return reject(new Error('FALLO_DESCARGA_YTDLP'));
        }
        console.log(`✅ Audio descargado exitosamente: ${outputFile}`);
        resolve();
      });

      ytdlp.on('error', (spawnErr) => {
        console.error('❌ Error al iniciar el proceso yt-dlp:', spawnErr);
        reject(new Error('FALLO_SPAWN_YTDLP'));
      });
    });

    await downloadPromise;

    // Verificar archivo válido
    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
      console.error(`❌ El archivo descargado no existe o está vacío: ${outputFile}`);
      throw new Error('ARCHIVO_DESCARGADO_INVALIDO');
    }

    // Subir a Cloudinary
    console.log(`☁️ Subiendo archivo a Cloudinary: ${outputFile}`);
    const result = await cloudinary.uploader.upload(outputFile, {
      resource_type: 'video',
      folder: folderName,
      public_id: title,
      use_filename: true,
      unique_filename: false,
      overwrite: false,
    });

    console.log(`☁️ Archivo subido a Cloudinary: ${result.secure_url}`);

    // Borrar archivo local
    fs.unlinkSync(outputFile);
    console.log(`🗑️ Archivo local eliminado después de subirlo: ${outputFile}`);

    res.json({
      secure_url: result.secure_url,
      title: result.public_id
    });

  } catch (err) {
    console.error('❌ Error en downloadAndUploadSong (catch principal):', err);

    let errorMessage = 'Error inesperado al procesar la solicitud.';
    let statusCode = 500;

    if (err.message === 'ACCESO_DENEGADO_AUTH_REQUIRED') {
      errorMessage = 'Este video requiere autenticación de YouTube. Las cookies podrían estar caducadas o inválidas.';
      statusCode = 403;
    } else if (err.message === 'FALLO_OBTENER_TITULO') {
      errorMessage = 'No se pudo obtener el título del video. Verifique la URL de YouTube.';
    } else if (err.message === 'FALLO_DESCARGA_YTDLP') {
      errorMessage = 'Error al descargar el audio. El video podría no estar disponible o tener restricciones.';
    } else if (err.message === 'FALLO_SPAWN_YTDLP') {
      errorMessage = 'No se pudo iniciar el proceso de descarga. Verifique yt-dlp en el servidor.';
    } else if (err.message === 'ARCHIVO_DESCARGADO_INVALIDO') {
      errorMessage = 'El archivo descargado está vacío o corrupto.';
    } else if (err.message.includes('uploadErr') || (err.http_code && err.http_code >= 400)) {
      errorMessage = 'Error al subir el archivo a Cloudinary. Verifique las credenciales.';
    } else if (err.message.includes('CRITICAL: Archivo de cookies no encontrado') || err.message.includes('CRITICAL: No se pudo leer el archivo de cookies')) {
      errorMessage = err.message;
    }

    if (outputFile && fs.existsSync(outputFile)) {
      try {
        fs.unlinkSync(outputFile);
        console.log(`🗑️ Archivo local eliminado tras error: ${outputFile}`);
      } catch (unlinkErr) {
        console.error(`❌ Error al eliminar archivo tras error: ${outputFile}`, unlinkErr);
      }
    }
    res.status(statusCode).json({ error: errorMessage });
  }
};

// Obtener canciones del usuario
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