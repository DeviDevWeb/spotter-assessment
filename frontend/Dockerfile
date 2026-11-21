########################################
################Build###################
########################################

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Empty base URL: the browser calls /api on the same origin and nginx proxies it
ARG VITE_API_BASE_URL=
ARG VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL

RUN npm run build

########################################
################Serve###################
########################################

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
