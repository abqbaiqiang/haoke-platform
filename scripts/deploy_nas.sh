#!/bin/sh
# 部署/更新到绿联 NAS。
# 用法: sh scripts/deploy_nas.sh [NAS地址] [SSH用户] [部署目录]
# 可选环境变量: NAS_SUDO_PW（NAS 上 sudo 密码，未配置则要求 NAS 用户已在 docker 组）
# 前提: 本机已配置到 NAS 的免密 SSH；部署期间保持 NAS 的 SSH 开启直到构建完成。
set -eu

NAS_HOST=${1:-192.168.1.107}
NAS_USER=${2:-abqbaiqiang}
NAS_DIR=${3:-/volume1/docker/haoke-platform}

remote() { ssh -o ConnectTimeout=10 "$NAS_USER@$NAS_HOST" "$@"; }

sudo_prefix=""
if [ -n "${NAS_SUDO_PW:-}" ]; then
    sudo_prefix="echo '$NAS_SUDO_PW' | sudo -S -p'' "
elif remote "$NAS_SUDO -n docker info >/dev/null 2>&1"; then
    sudo_prefix="$NAS_SUDO "
else
    echo "错误: NAS 用户无 docker 权限且未设置 NAS_SUDO_PW" >&2
    exit 1
fi

echo "==> 打包当前提交 ($(git rev-parse --short HEAD))"
archive=$(mktemp -t haoke-release-XXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
git archive --format=tar.gz -o "$archive" HEAD

echo "==> 上传代码"
cat "$archive" | remote "cat > $NAS_DIR/release.tar.gz"

echo "==> 解压（.env 与数据目录不受影响）"
remote "tar -xzf $NAS_DIR/release.tar.gz -C $NAS_DIR && rm $NAS_DIR/release.tar.gz && test -f $NAS_DIR/.env"

echo "==> 构建并启动（约几分钟到几十分钟，请勿中途关闭 NAS 的 SSH）"
remote "${sudo_prefix}docker compose -f $NAS_DIR/docker-compose.yml --project-directory $NAS_DIR up -d --build"

echo "==> 容器状态"
remote "${sudo_prefix}docker compose -f $NAS_DIR/docker-compose.yml --project-directory $NAS_DIR ps"
echo "部署完成。"
