# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./

# ---- Dependencies ----
# Install ALL dependencies including dev dependencies
FROM base AS dependencies
RUN npm install

# ---- Build ----
# Build the application
FROM dependencies AS build
COPY . .
RUN npm run build

# ---- Production ----
# Prepare production image
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Copy production dependencies from dependencies stage
COPY package*.json ./
RUN npm install --omit=dev

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist

# Expose port and start app
EXPOSE 3300
CMD [ "node", "dist/index.js" ]
