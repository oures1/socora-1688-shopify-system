FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY local-admin-app/package.json ./
COPY local-admin-app/requirements.txt ./

RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

COPY local-admin-app/ ./

ENV PORT=4877
ENV PYTHON=python3
ENV DATA_DIR=/app/data
ENV SMALLORDER_TEMPLATE=/app/templates/smallorder.xlsx

RUN mkdir -p /app/data

EXPOSE 4877

CMD ["npm", "start"]
