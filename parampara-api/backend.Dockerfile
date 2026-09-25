FROM node:20-alpine

WORKDIR /app

# Backend package files
COPY parampara-api/package*.json ./

RUN npm ci --omit=dev

# Backend source
COPY parampara-api/ .

# Parampara data required by import-data.js
COPY data/ /data/

# Quiz data required by import-data.js
COPY indian_states_culture_heritage_quiz.json /indian_states_culture_heritage_quiz.json

EXPOSE 3000

CMD ["sh", "-c", "npm run db:init && npm run db:import && npm start"]