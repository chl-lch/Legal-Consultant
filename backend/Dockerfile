FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户（安全最佳实践：不以 root 运行进程）
RUN groupadd -r appuser && useradd -r -g appuser -u 1000 appuser

COPY backend /app

# 只安装生产依赖，不安装 dev 依赖（pytest、ruff 等不需要进镜像）
RUN pip install --upgrade pip && pip install -e .

# 创建数据目录并授权（k8s PVC 挂载后 fsGroup 需要能写入）
RUN mkdir -p /app/data/uploads /app/data/indexes && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# 注意：alembic upgrade head 已移至独立的 k8s Job（k8s/backend/migration-job.yaml）
# 这里只启动应用服务器
# --workers 2：双 worker 提升并发（单机器，不超过 CPU 核心数 x 2）
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
