FROM node:22-alpine

# su-exec：容器以 root 启动、把 node 用户加入宿主机 docker.sock 所属组后降权运行
RUN apk add --no-cache su-exec

WORKDIR /app
COPY server.js catalog.js updates.js quicksetup.js selfupdate.js launcher.js package.json ./
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/ros-center-entrypoint.sh
RUN chmod 0755 /usr/local/bin/ros-center-entrypoint.sh \
 && mkdir -p /app/data && chown -R node:node /app/data

# 入口脚本需要读 socket 的 GID 并调整用户组；它会在 exec 之前降权回 node。
# 若用户在 compose 里显式指定了 user:，入口脚本会跳过改组、直接按该用户运行。
USER root

ENV PORT=10086 \
    HOST=0.0.0.0 \
    POLL_INTERVAL_MS=1000 \
    HISTORY_POINTS=180

EXPOSE 10086

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/ros-center-entrypoint.sh"]
CMD ["node", "server.js"]
