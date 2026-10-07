# Shopping en Chine: one image. The FastAPI backend serves the API under /api
# and the built React site for every other path (same origin, no CORS setup).

# ---- 1. Build the React site ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json ./
# Emergent's visual-edits plugin is a dev-only tool (unused by `yarn build`);
# dropping it keeps the build independent of Emergent's asset server.
RUN node -e "const fs=require('fs');const p=require('./package.json');delete p.devDependencies['@emergentbase/visual-edits'];fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && yarn install --network-timeout 600000
COPY frontend/ ./
# The API is on the same origin, so the site calls "/api" directly.
ENV REACT_APP_BACKEND_URL=""
RUN yarn build

# ---- 2. Python API, serving the built site ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_BUILD_DIR=/app/frontend/build
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/build /app/frontend/build
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001}"]
