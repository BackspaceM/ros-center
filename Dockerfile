FROM node:22-alpine

WORKDIR /app
COPY server.js catalog.js ./
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENV PORT=3000 \
    HOST=0.0.0.0 \
    POLL_INTERVAL_MS=2000 \
    HISTORY_POINTS=180

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
