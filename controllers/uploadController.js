import dotenv from 'dotenv';
import cloudinary from '../helpers/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';

dotenv.config();

const outputDir = path.resolve('./descargas');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Define la ruta a tu archivo de cookies.
// Asegúrate de que 'cookies.txt' exista en la raíz de tu proyecto o ajusta la ruta si lo pones en otro lugar.
const cookiesFilePath = path.resolve('./cookies.txt');

export const uploadSong = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos' });
    }

    const user = req.usuario;
    // Limpia el nombre del usuario para usarlo en la ruta de la carpeta
    const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
    const folderName = `music-player/${safeName}_${user.id}`;

    const uploads = await Promise.all(req.files.map(async (file) => {
      const originalName = path.parse(file.originalname).name;

      // Sube el archivo a Cloudinary
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: 'video', // Se usa 'video' para archivos de audio en Cloudinary si quieres transcodificación completa
        folder: folderName,
        public_id: originalName,
        use_filename: true,
        unique_filename: false,
        overwrite: false, // Evita sobrescribir si ya existe un archivo con el mismo nombre
      });

      // Elimina el archivo temporal después de subirlo
      fs.unlinkSync(file.path);

      return {
        secure_url: result.secure_url,
        title: file.originalname
      };
    }));

    res.json(uploads);
  } catch (err) {
    console.error('❌ Error subiendo a Cloudinary:', err);
    res.status(500).json({ error: 'Error al subir los archivos' });
  }
};

export const downloadAndUploadSong = async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL requerida' });
  }

  const user = req.usuario;
  const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
  const folderName = `music-player/${safeName}_${user.id}`;

  try {
    // Primero, intenta obtener el título del video/audio usando yt-dlp.
    // Incluye el flag --cookies para autenticación.
    exec(`yt-dlp --cookies "${cookiesFilePath}" --get-title "${url}"`, (err, stdout) => {
      if (err) {
        console.error('❌ Error obteniendo título:', err);
        // Detecta si el error es de autenticación para dar un mensaje más claro al usuario
        if (err.message.includes("Sign in to confirm you’re not a bot") || err.message.includes("See https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp for how to manually pass cookies")) {
            return res.status(403).json({ error: 'Acceso denegado: Este video requiere autenticación de YouTube. Asegúrate de que tu archivo de cookies sea válido y la cuenta esté iniciada sesión.' });
        }
        return res.status(500).json({ error: 'Error obteniendo título del video.' });
      }

      // Limpia el título obtenido para que sea un nombre de archivo seguro
      const title = stdout.trim().replace(/[^a-zA-Z0-9-_ ]/g, '');
      const outputFile = path.join(outputDir, `${title}.mp3`);

      console.log(`🎵 Descargando audio de: ${url} como "${title}.mp3"`);

      // Inicia la descarga del audio usando yt-dlp como un proceso separado.
      // También se le pasa el flag --cookies aquí.
      const ytdlp = spawn('yt-dlp', [
        '-x',                  // Extrae el audio
        '--audio-format', 'mp3', // Formato de audio MP3
        '-o', outputFile,      // Ruta de salida del archivo
        '--cookies', cookiesFilePath, // Pasa el archivo de cookies
        url                    // La URL del video/audio
      ]);

      // Muestra la salida de error de yt-dlp en la consola del servidor
      ytdlp.stderr.on('data', (data) => {
        console.error(`⚠️ yt-dlp stderr: ${data.toString()}`);
      });

      // Maneja el cierre del proceso yt-dlp
      ytdlp.on('close', async (code) => {
        if (code !== 0) {
          console.error(`❌ yt-dlp salió con código de error: ${code}. No se pudo descargar el audio.`);
          // Si hubo un error en la descarga, intenta eliminar cualquier archivo parcial que se haya creado
          if (fs.existsSync(outputFile)) {
              fs.unlinkSync(outputFile);
          }
          return res.status(500).json({ error: 'Error al descargar el audio. Verifique la URL o si el video requiere autenticación.' });
        }

        console.log(`✅ Audio descargado: ${outputFile}`);

        try {
          // Sube el archivo descargado a Cloudinary
          const result = await cloudinary.uploader.upload(outputFile, {
            resource_type: 'video', // Usar 'video' es común para archivos de audio que requieren transcodificación.
            folder: folderName,
            public_id: title,
            use_filename: true,
            unique_filename: false,
            overwrite: false,
          });

          // Elimina el archivo local después de subirlo a Cloudinary
          fs.unlinkSync(outputFile);
          console.log(`☁️ Archivo subido a Cloudinary: ${result.secure_url}`);

          res.json({
            secure_url: result.secure_url,
            title: result.public_id
          });
        } catch (uploadErr) {
          console.error('❌ Error subiendo a Cloudinary después de descargar:', uploadErr);
          res.status(500).json({ error: 'Error al subir el archivo a Cloudinary.' });
        }
      });
    });
  } catch (err) {
    console.error('❌ Error general en downloadAndUploadSong:', err);
    res.status(500).json({ error: 'Error inesperado en el servidor.' });
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
      .sort_by('created_at', 'desc') // Ordena por fecha de creación descendente
      .max_results(30) // Limita a 30 resultados
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