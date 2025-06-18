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

# *** LÍNEAS MODIFICADAS/AÑADIDAS AQUÍ ***
# Copia el archivo cookies.txt a una ruta accesible y temporal
# Asegúrate de que tu archivo cookies.txt esté en la raíz de tu proyecto local
COPY cookies.txt /tmp/cookies.txt
# Establece permisos de lectura explícitos para el archivo de cookies
RUN chmod 644 /tmp/cookies.txt


# Si necesitas un directorio de descargas temporal, créalo y asegúrate de permisos
RUN mkdir -p /tmp/descargas && chmod -R 777 /tmp/descargas
#debug
RUN ls -l /tmp/ && head -n 10 /tmp/cookies.txt

# Expone el puerto que usará tu app (ajusta si usas otro puerto)
EXPOSE 3000

# Comando para iniciar tu app
CMD ["node", "index.js"]