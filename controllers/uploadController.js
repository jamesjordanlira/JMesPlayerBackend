import dotenv from 'dotenv';
import cloudinary from '../helpers/cloudinary.js'; // Asegúrate de que esta ruta sea correcta
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';

dotenv.config();

// Directorio temporal para almacenar los archivos de audio descargados
// Usamos /tmp para asegurar permisos de escritura en entornos Docker/Render
const outputDir = path.resolve('/tmp/descargas'); // Cambiado a /tmp para entornos de servidor

// Asegura que el directorio de salida exista
if (!fs.existsSync(outputDir)) {
  try {
    fs.mkdirSync(outputDir, { recursive: true }); // `recursive: true` crea directorios anidados si no existen
    console.log(`✅ Directorio de descargas creado: ${outputDir}`);
  } catch (mkDirErr) {
    console.error(`❌ Error al crear el directorio de descargas ${outputDir}:`, mkDirErr);
    // Un error aquí significa que el servicio probablemente no podrá funcionar
    // Puedes considerar salir del proceso con process.exit(1) en un entorno de producción
  }
}

// Ruta al archivo de cookies.
// Esta variable de entorno debe apuntar a la ruta donde Docker COPIA el archivo cookies.txt
// Por defecto: '/tmp/cookies.txt'
const COOKIES_PATH = process.env.COOKIES_PATH || '/tmp/cookies.txt';

export const uploadSong = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos' });
    }

    const user = req.usuario; // Asume que el usuario está autenticado y disponible en req.usuario
    const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
    const folderName = `music-player/${safeName}_${user.id}`;

    const uploads = await Promise.all(req.files.map(async (file) => {
      const originalName = path.parse(file.originalname).name;

      // Sube el archivo a Cloudinary
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: 'video', // 'video' es común para audio en Cloudinary si se necesita transcodificación
        folder: folderName,
        public_id: originalName,
        use_filename: true,
        unique_filename: false,
        overwrite: false,
      });

      // Elimina el archivo temporal después de subirlo
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

export const downloadAndUploadSong = async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL requerida' });
  }

  const user = req.usuario; // Asume que el usuario está autenticado
  const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
  const folderName = `music-player/${safeName}_${user.id}`;

  let outputFile = null; // Declarar aquí para asegurar su alcance en los bloques catch/finally

  try {
    // Verificar si el archivo de cookies existe ANTES de intentar usarlo
    // Ahora, COOKIES_PATH es la ruta donde Docker lo copió
    if (!fs.existsSync(COOKIES_PATH)) {
      console.error(`❌ Error: El archivo de cookies NO existe en la ruta: ${COOKIES_PATH}. Asegúrate de que el Dockerfile lo copie correctamente y la variable COOKIES_PATH esté bien configurada en Render.`);
      // Devuelve un 500 porque es un problema de configuración del servidor
      return res.status(500).json({ error: 'Configuración de cookies no encontrada en el servidor. Contacte al administrador.' });
    }
    console.log(`✅ Archivo de cookies encontrado en: ${COOKIES_PATH}`);

    // --- Paso 1: Obtener el título usando yt-dlp ---
    // Incluye --cookies para autenticación.
    // Usamos `exec` para una ejecución simple de un solo comando que devuelve stdout/stderr
    const getTitleCmd = `yt-dlp --cookies "${COOKIES_PATH}" --get-title "${url}"`;
    console.log(`ℹ️ Ejecutando comando para obtener título: ${getTitleCmd}`);

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(getTitleCmd, (err, stdout, stderr) => {
        if (err) {
          // Si hay un error, loguea stderr para más detalles
          console.error('❌ Error en exec (obtener título):', err);
          console.error('⚠️ STDERR de yt-dlp (get-title):', stderr);
          // Mensaje más específico si el error es de autenticación
          if (stderr.includes("Sign in to confirm you’re not a bot") || stderr.includes("See https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp")) {
              // Rechaza con un error específico para el catch principal
              return reject(new Error('ACCESO_DENEGADO_AUTH_REQUIRED'));
          }
          return reject(new Error('FALLO_OBTENER_TITULO'));
        }
        resolve({ stdout, stderr });
      });
    });

    const title = stdout.trim().replace(/[^a-zA-Z0-9-_ ]/g, ''); // Limpiar el título para nombre de archivo
    outputFile = path.join(outputDir, `${title}.mp3`); // Ruta completa del archivo de audio

    console.log(`🎵 Título obtenido: "${title}". Archivo de salida esperado: ${outputFile}`);
    console.log(`🎵 Iniciando descarga de audio de: ${url}`);

    // --- Paso 2: Descargar el audio usando yt-dlp ---
    // Usamos `spawn` para procesos de larga duración y para manejar el flujo de stdout/stderr en tiempo real
    const ytdlp = spawn('yt-dlp', [
      '--cookies', COOKIES_PATH, // Pasa el archivo de cookies para la descarga
      '-x',                  // Extraer audio
      '--audio-format', 'mp3', // Formato de audio MP3
      '-o', outputFile,      // Ruta de salida del archivo
      url                    // La URL del video/audio
    ]);

    // Log de la salida de error de yt-dlp en tiempo real
    ytdlp.stderr.on('data', (data) => {
      console.error(`⚠️ yt-dlp STDERR (descarga): ${data.toString().trim()}`);
    });

    // Manejar el cierre del proceso yt-dlp
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

    await downloadPromise; // Esperar a que la descarga termine

    // --- Paso 3: Subir el archivo descargado a Cloudinary ---
    // Verificar si el archivo realmente se creó y no está vacío (opcional, pero buena práctica)
    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
        console.error(`❌ El archivo descargado no existe o está vacío: ${outputFile}`);
        throw new Error('ARCHIVO_DESCARGADO_INVALIDO');
    }

    console.log(`☁️ Subiendo archivo a Cloudinary: ${outputFile}`);
    const result = await cloudinary.uploader.upload(outputFile, {
      resource_type: 'video', // Usar 'video' es común para archivos de audio en Cloudinary que requieren transcodificación.
      folder: folderName,
      public_id: title, // Usar el título limpio como public_id
      use_filename: true, // Usar el filename original si no se especifica public_id
      unique_filename: false, // No añadir sufijo único, confiar en public_id
      overwrite: false, // No sobrescribir si ya existe un archivo con el mismo nombre
    });

    console.log(`☁️ Archivo subido a Cloudinary: ${result.secure_url}`);

    // --- Paso 4: Eliminar el archivo local después de subirlo a Cloudinary ---
    fs.unlinkSync(outputFile);
    console.log(`🗑️ Archivo local eliminado después de subirlo: ${outputFile}`);

    res.json({
      secure_url: result.secure_url,
      title: result.public_id
    });

  } catch (err) {
    // Manejo de errores centralizado
    console.error('❌ Error en downloadAndUploadSong (catch principal):', err);

    let errorMessage = 'Error inesperado al procesar la solicitud.';
    let statusCode = 500;

    if (err.message === 'ACCESO_DENEGADO_AUTH_REQUIRED') {
        errorMessage = 'Este video requiere autenticación de YouTube. Las cookies configuradas en el servidor podrían estar caducadas o no ser válidas.';
        statusCode = 403;
    } else if (err.message === 'FALLO_OBTENER_TITULO') {
        errorMessage = 'No se pudo obtener el título del video. Verifique la URL de YouTube.';
    } else if (err.message === 'FALLO_DESCARGA_YTDLP') {
        errorMessage = 'Hubo un error al descargar el audio. El video podría no estar disponible o tener restricciones.';
    } else if (err.message === 'FALLO_SPAWN_YTDLP') {
        errorMessage = 'No se pudo iniciar el proceso de descarga. El sistema yt-dlp podría no estar instalado o configurado correctamente en el servidor.';
    } else if (err.message === 'ARCHIVO_DESCARGADO_INVALIDO') {
        errorMessage = 'El archivo de audio descargado está vacío o corrupto. Es posible que la descarga haya fallado silenciosamente.';
    } else if (err.message.includes('uploadErr') || (err.http_code && err.http_code >= 400)) { // Errores de subida de Cloudinary
        errorMessage = 'Error al subir el archivo a Cloudinary. Verifique las credenciales.';
        statusCode = 500;
    }
    // No necesitamos un `else if` para el error de `fs.existsSync` si ya lo retornamos antes
    // o si el catch de arriba lo manejaría.

    // Asegurarse de limpiar el archivo descargado si existe
    if (outputFile && fs.existsSync(outputFile)) {
      try {
        fs.unlinkSync(outputFile);
        console.log(`🗑️ Archivo local eliminado tras error: ${outputFile}`);
      } catch (unlinkErr) {
        console.error(`❌ Error al eliminar archivo tras otro error: ${outputFile}`, unlinkErr);
      }
    }
    res.status(statusCode).json({ error: errorMessage });
  }
};

export const getSongs = async (req, res) => {
  try {
    const user = req.usuario;
    const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
    const folderName = `music-player/${safeName}_${user.id}`;

    // Busca canciones en la carpeta específica del usuario en Cloudinary
    const result = await cloudinary.search
      .expression(`folder:${folderName}`)
      .sort_by('created_at', 'desc')
      .max_results(30)
      .execute();

    // Mapea los resultados para obtener solo el título (filename) y la URL segura
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
