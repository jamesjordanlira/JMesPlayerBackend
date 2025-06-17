import dotenv from 'dotenv';
import cloudinary from '../helpers/cloudinary.js';
import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import ytdl from 'ytdl-core';

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

  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'URL inválida o no proporcionada' });
  }

  const user = req.usuario;
  const safeName = user.nombre.replace(/[^a-zA-Z0-9-_]/g, '');
  const folderName = `music-player/${safeName}_${user.id}`;

  try {
    // Obtener título usando ytdl-core
    const info = await ytdl.getInfo(url);
    const rawTitle = info.videoDetails.title;
    const title = rawTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_'); // Limpia título

    const outputFile = path.join(outputDir, `${title}.mp3`);

    console.log(`🎵 Descargando audio de: ${url}`);

    // Descarga audio y guarda en archivo
    await new Promise((resolve, reject) => {
      ytdl(url, { filter: 'audioonly', quality: 'highestaudio' })
        .pipe(fs.createWriteStream(outputFile))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Sube a Cloudinary
    const result = await cloudinary.uploader.upload(outputFile, {
      resource_type: 'video',
      folder: folderName,
      public_id: title,
      use_filename: true,
      unique_filename: false,
      overwrite: false,
    });

    // Elimina archivo local
    await fsExtra.remove(outputFile);

    res.json({
      secure_url: result.secure_url,
      title: result.public_id
    });

  } catch (err) {
    console.error('❌ Error general:', err);
    res.status(500).json({ error: 'Error inesperado al descargar y subir canción' });
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
