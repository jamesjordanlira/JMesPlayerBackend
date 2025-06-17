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
    exec(`yt-dlp --cookies /etc/secrets/cookies.txt --get-title "${url}"`, (err, stdout) => {
      if (err) {
        console.error('❌ Error obteniendo título:', err);
        return res.status(500).json({ error: 'Error obteniendo título' });
      }

      const title = stdout.trim().replace(/[^a-zA-Z0-9-_ ]/g, '');
      const safeTitle = title.replace(/[^a-zA-Z0-9-_]/g, '_');
      const outputFile = path.join(outputDir, `${safeTitle}.mp3`);

      console.log(`🎵 Descargando audio de: ${url}`);

      const ytdlp = spawn('yt-dlp', [
        '-x',
        '--audio-format', 'mp3',
        '--cookies', '/etc/secrets/cookies.txt',
        '-o', outputFile,
        url
      ]);

      ytdlp.stderr.on('data', (data) => {
        console.error(`⚠️ yt-dlp: ${data.toString()}`);
      });

      ytdlp.on('close', async (code) => {
        if (code !== 0) {
          console.error(`❌ yt-dlp salió con código: ${code}`);
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          return res.status(500).json({ error: 'Error al descargar el audio' });
        }

        try {
          const result = await cloudinary.uploader.upload(outputFile, {
            resource_type: 'video',
            folder: folderName,
            public_id: safeTitle,
            use_filename: true,
            unique_filename: false,
            overwrite: false,
          });

          fs.unlinkSync(outputFile);

          res.json({
            secure_url: result.secure_url,
            title: result.public_id
          });
        } catch (uploadErr) {
          console.error('❌ Error subiendo a Cloudinary:', uploadErr);
          if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          res.status(500).json({ error: 'Error al subir el archivo' });
        }
      });
    });
  } catch (err) {
    console.error('❌ Error general:', err);
    res.status(500).json({ error: 'Error inesperado' });
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
    res.status(500).json({ error: 'Error al obtener canciones' });
  }
};
