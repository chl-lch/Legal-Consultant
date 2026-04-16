#!/usr/bin/env bash
# LexiCounsel k8s 部署脚本
# 使用前提：已配置好 kubectl 指向目标集群
#
# 用法：
#   chmod +x k8s/deploy.sh
#   ./k8s/deploy.sh
set -euo pipefail

# ── 颜色输出 ─────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 前置检查 ──────────────────────────────────────────
command -v kubectl &>/dev/null || error "kubectl 未安装"
kubectl cluster-info &>/dev/null || error "kubectl 无法连接到集群，请先配置 kubeconfig"

warn "部署开始前，请确认已完成以下操作："
warn "  1. 将 k8s/postgres/secret.yaml 中的 REPLACE_WITH_STRONG_PASSWORD 替换为真实密码"
warn "  2. 将 k8s/backend/secret.yaml  中的两个占位符替换为真实值"
warn "  3. 将 k8s/backend/configmap.yaml 中的 YOUR_DOMAIN.com 替换为真实域名"
warn "  4. 将所有 deployment/job yaml 中的 YOUR_REGISTRY 替换为真实镜像地址"
warn "  5. 将 k8s/frontend/ingress.yaml 中的 YOUR_DOMAIN.com 替换为真实域名"
echo ""
read -r -p "确认已完成以上步骤？(yes/no): " confirm
[[ "$confirm" == "yes" ]] || error "请先完成配置再部署"

# ── 步骤 1：创建 Namespace ────────────────────────────
info "步骤 1/6：创建 Namespace..."
kubectl apply -f k8s/namespace.yaml

# ── 步骤 2：部署 PostgreSQL ───────────────────────────
info "步骤 2/6：部署 PostgreSQL..."
kubectl apply -f k8s/postgres/secret.yaml
kubectl apply -f k8s/postgres/pvc.yaml
kubectl apply -f k8s/postgres/statefulset.yaml
kubectl apply -f k8s/postgres/service.yaml

info "等待 PostgreSQL 就绪..."
kubectl rollout status statefulset/postgres -n lexicounsel --timeout=120s

# ── 步骤 3：运行数据库迁移 ────────────────────────────
info "步骤 3/6：运行数据库迁移 (alembic upgrade head)..."
kubectl delete job backend-migration -n lexicounsel --ignore-not-found
kubectl apply -f k8s/backend/migration-job.yaml

info "等待迁移完成..."
kubectl wait --for=condition=complete job/backend-migration \
  -n lexicounsel --timeout=120s \
  || error "数据库迁移失败，请查看日志：kubectl logs -l job-name=backend-migration -n lexicounsel"

# ── 步骤 4：部署 Backend ──────────────────────────────
info "步骤 4/6：部署 Backend..."
kubectl apply -f k8s/backend/configmap.yaml
kubectl apply -f k8s/backend/secret.yaml
kubectl apply -f k8s/backend/pvc.yaml
kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml

info "等待 Backend 就绪..."
kubectl rollout status deployment/backend -n lexicounsel --timeout=180s

# ── 步骤 5：部署 Frontend ─────────────────────────────
info "步骤 5/6：部署 Frontend..."
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml

info "等待 Frontend 就绪..."
kubectl rollout status deployment/frontend -n lexicounsel --timeout=60s

# ── 步骤 6：配置 Ingress ──────────────────────────────
info "步骤 6/6：配置 Ingress..."
kubectl apply -f k8s/frontend/ingress.yaml

# ── 部署完成 ──────────────────────────────────────────
echo ""
info "✅ 部署完成！"
echo ""
info "查看所有资源状态："
echo "  kubectl get all -n lexicounsel"
echo ""
info "查看 Ingress 地址："
echo "  kubectl get ingress -n lexicounsel"
echo ""
info "查看 backend 日志："
echo "  kubectl logs -f deployment/backend -n lexicounsel"
