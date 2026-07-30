# Handoff §11.3 — a long-running agent, not a function. Needs to stay registered with LiveKit
# and survive restarts on its own.
FROM node:20-slim

# dumb-init makes PID 1 forward SIGTERM properly, so the drain logic in index.js actually runs
# and a deploy does not hang up on whoever is mid-call.
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src

ENV NODE_ENV=production PORT=8080
EXPOSE 8080

# Never run as root.
USER node

# The platform restarts the container when this fails. index.js keeps the health server up even
# when the agent is down, so a failure is reported rather than silently looping.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init","--"]
CMD ["node","src/index.js"]
