# GoLah! Cloud Run image — HTTPS is terminated by Google; the app listens on $PORT.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json capacitor.config.ts ./
COPY src ./src
COPY public ./public
ARG VITE_GOOGLE_MAPS_API_KEY=
ARG VITE_API_BASE=
ARG VITE_ADSENSE_CLIENT=
ARG VITE_ADSENSE_SLOT=
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT
ENV VITE_ADSENSE_SLOT=$VITE_ADSENSE_SLOT
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HTTPS=0
ENV HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY data/postal-map.json ./data/postal-map.json
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "server/index.js", "--no-https"]
