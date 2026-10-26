# Coolify deployment for The Delegation (agents.zentacode.com, port 3000).
# Stage 1 builds the Vite SPA; stage 2 serves ./dist with server.js.
# No Gemini key is baked in: the key is entered by the user in the
# browser BYOK modal (localStorage). If a build-time GEMINI_API_KEY is
# ever set in Coolify, Vite would embed it in the client bundle, so
# do NOT set it as a build secret unless the owner explicitly accepts
# that the key becomes visible in the served JavaScript.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
