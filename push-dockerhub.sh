#!/usr/bin/env bash
# 构建并推送镜像到 Docker Hub
# 用法：DOCKERHUB_USER=你的用户名 DOCKERHUB_TOKEN=你的PAT ./push-dockerhub.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${DOCKERHUB_USER:-}" ] || [ -z "${DOCKERHUB_TOKEN:-}" ]; then
  echo "请先设置 DOCKERHUB_USER 和 DOCKERHUB_TOKEN 环境变量" >&2
  exit 1
fi

IMAGE="${DOCKERHUB_USER}/routeros-traffic-webui:latest"
printf '%s' "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin
docker build -t "$IMAGE" .
docker push "$IMAGE"
echo "已推送: $IMAGE"
echo "使用: docker compose up -d --build（在 .env 中设置 DOCKER_IMAGE=$IMAGE）"
