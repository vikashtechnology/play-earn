FROM node:22-alpine

WORKDIR /app

COPY . .
RUN npm ci --omit=dev
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "--workspace", "@rewards-platform/api", "run", "start"]
