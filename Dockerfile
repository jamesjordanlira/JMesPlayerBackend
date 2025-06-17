# Usa una imagen oficial de Node.js con Debian
FROM node:18

# Instala python3, pip y ffmpeg (para procesamiento de audio)
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg \
    # Instala yt-dlp globalmente sin usar --user
    && pip3 install --no-cache-dir yt-dlp \
    # Crea enlace simbólico para yt-dlp en /usr/local/bin para que esté en el PATH
    && ln -s $(python3 -m site --user-base)/bin/yt-dlp /usr/local/bin/yt-dlp \
    # Limpia caches para reducir el tamaño final
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Define el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de dependencias
COPY package*.json ./

# Instala las dependencias de Node.js
RUN npm install

# Copia el resto del código fuente
COPY . .

# Expone el puerto que usará tu app (ajusta si usas otro puerto)
EXPOSE 3000

# Comando para iniciar tu app 
CMD ["node", "index.js"]