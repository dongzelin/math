FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY . .
RUN npm run build -w web && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8788
ENV HOST=0.0.0.0

EXPOSE 8788

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start", "-w", "server"]
