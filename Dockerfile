FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
COPY server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
