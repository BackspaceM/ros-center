FROM node:22-alpine

WORKDIR /app
COPY server.js catalog.js ./
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENV PORT=10086 \
    HOST=0.0.0.0 \
    POLL_INTERVAL_MS=1000 \
    HISTORY_POINTS=180

EXPOSE 10086

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
