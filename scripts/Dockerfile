FROM node:22.17.0-alpine
ARG MODE
ENV MODE=${MODE:-test}
WORKDIR /app
ADD . /app
RUN npm install
CMD ["sh", "-c", "if [ \"$MODE\" = 'prod' ]; then npm run start-prod; else npm run start; fi"]
