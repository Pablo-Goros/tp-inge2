# Etapa 1: build. VITE_API=http se fija acá porque Vite lo incrusta en el bundle; sin él la imagen arrancaría con el mock.
FROM node:22.12-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API=http
RUN npm run build

# Etapa 2: nginx sirve dist/ y reenvía /api al backend.
FROM nginx:1.28.0-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
