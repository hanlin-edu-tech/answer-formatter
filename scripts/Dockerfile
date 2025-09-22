FROM node:22
ARG MODE
ENV MODE=${MODE:-test}
WORKDIR /app
ADD . /app
RUN npm install
CMD ["sh", "-c", "if [ \"$MODE\" = 'prod' ]; then npm run start-prod; else npm run start; fi"]
