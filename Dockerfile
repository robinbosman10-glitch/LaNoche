FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY assets ./assets
ENV DATA_DIR=/data
RUN mkdir -p /data
CMD ["npm", "start"]
