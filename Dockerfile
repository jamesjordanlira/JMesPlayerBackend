# Usa una imagen oficial de Node.js con Debian
FROM node:18

# Instala dependencias necesarias y yt-dlp
RUN apt-get update && \
    apt-get install -y curl ffmpeg python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Define el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de dependencias
COPY package*.json ./

# Instala las dependencias de Node.js
RUN npm install

# Copia el resto del código fuente
COPY . .

# Crea el directorio de descargas temporal y da permisos
RUN mkdir -p /app/descargas && chmod -R 777 /app/descargas

# Expone el puerto que usará tu app
EXPOSE 3000

# Comando para iniciar tu app
CMD ["node", "index.js"]
