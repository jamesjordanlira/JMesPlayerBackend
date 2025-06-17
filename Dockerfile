# Usa una imagen base oficial de Node.js
FROM node:18

# Actualiza apt y instala python3-pip y ffmpeg, además instala yt-dlp con pip3
RUN apt-get update && apt-get install -y \
    python3-pip \
    ffmpeg \
    && pip3 install yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Establece el directorio de trabajo
WORKDIR /app

# Copia archivos package.json para instalar dependencias primero (cache útil)
COPY package*.json ./

# Instala las dependencias de Node.js
RUN npm install

# Copia el resto de los archivos de tu proyecto
COPY . .

# Expone el puerto que tu app usa (ejemplo 3000)
EXPOSE 3000

# Comando para iniciar tu app (ajusta si usas otro archivo o comando)
CMD ["node", "index.js"]
