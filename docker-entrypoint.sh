#!/bin/sh
# ROS Center 容器入口：让应用用户获得宿主机 docker.sock 的访问权限。
#
# 镜像原本以 USER node (uid/gid 1000) 运行，而宿主机 /var/run/docker.sock 通常是
# srw-rw---- root:docker，GID 各发行版/NAS 都不同（群晖常见 999/1000/998）。
# 于是「映射了 socket 却仍旧无权连接」。这里以 root 启动时读取 socket 的 GID，
# 建同名组并把 node 加入，再用 su-exec 降权运行应用，用户无需改 compose。
# 任何一步失败都不会阻断启动（最差退化为直接运行，仍能通过 user:/group_add 手动授权）。
set -e
SOCK="${ROS_DOCKER_SOCKET:-/var/run/docker.sock}"

if [ "$(id -u)" = "0" ] && [ -S "$SOCK" ]; then
  GID="$(stat -c '%g' "$SOCK" 2>/dev/null || true)"
  if [ -n "$GID" ] && [ "$GID" != "0" ]; then
    GRP="$(awk -F: -v g="$GID" '$3 == g { print $1; exit }' /etc/group 2>/dev/null || true)"
    if [ -z "$GRP" ]; then
      GRP="rosdockersock"
      addgroup -g "$GID" "$GRP" >/dev/null 2>&1 || GRP=""
    fi
    if [ -n "$GRP" ]; then
      addgroup node "$GRP" >/dev/null 2>&1 || true
    fi
  fi
fi

if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1; then
  exec su-exec node "$@"
fi
exec "$@"
