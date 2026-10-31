#!/bin/bash
# Server-side deploy. Installed at /opt/apps/raymond/deploy.sh (root-owned) and
# run through sudo by the restricted deploy SSH key. Argument: full commit SHA.
set -euo pipefail

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <40-char commit sha>" >&2; exit 2; }

ROOT=/opt/apps/raymond
REPO_URL=https://github.com/ahmedtouzani/raymond.git
SRC="$ROOT/src-deploy"
TAG="${SHA:0:12}"
cd "$ROOT"
exec 9>"$ROOT/.deploy.lock"; flock -n 9 || { echo "another deploy is running" >&2; exit 3; }

compose() { RAYMOND_TAG="$1" docker compose -p raymond -f "$ROOT/compose.yaml" "${@:2}"; }

PREV_IMAGE="$(docker inspect -f '{{.Config.Image}}' raymond-bot-1 2>/dev/null || true)"
PREV_TAG="${PREV_IMAGE#raymond:}"
echo "== previous image: ${PREV_IMAGE:-none}"

echo "== a. fetch $SHA"
if [ ! -d "$SRC/.git" ]; then git init -q "$SRC"; git -C "$SRC" remote add origin "$REPO_URL"; fi
git -C "$SRC" fetch --depth 1 origin "$SHA"
git -C "$SRC" checkout -q --force --detach "$SHA"
git -C "$SRC" clean -fdxq

echo "== b. build raymond:$TAG (runs npm test)"
docker build -t "raymond:$TAG" "$SRC"

echo "== c. database backup"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/pre-deploy-$STAMP-$TAG.dump"
compose "${PREV_TAG:-$TAG}" exec -T db pg_dump -U postgres -d raymond -Fc > "$BACKUP"
[ -s "$BACKUP" ] || { echo "backup is empty, aborting" >&2; rm -f "$BACKUP"; exit 4; }
ls -t "$ROOT"/backups/pre-deploy-*.dump | tail -n +11 | xargs -r rm -f   # keep last 10

echo "== d. start new bot"
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG="$ROOT/logs/combined.log"   # winston writes JSON here in production (no console output)
LOG_FROM=$(( $( (wc -l < "$LOG") 2>/dev/null || echo 0) + 1 ))
compose "$TAG" up -d bot

echo "== e. health check"
ok=0
for _ in $(seq 1 12); do
  sleep 5
  state="$(docker inspect -f '{{.State.Status}} {{.RestartCount}}' raymond-bot-1 2>/dev/null || echo missing)"
  if [ "$state" != "running 0" ]; then echo "state: $state"; break; fi
  [ "$( (wc -l < "$LOG") 2>/dev/null || echo 0)" -ge "$LOG_FROM" ] || LOG_FROM=1   # log was rotated
  new="$(tail -n +"$LOG_FROM" "$LOG" 2>/dev/null || true)"
  errors="$(grep '"level":"error"' <<<"$new" | grep -v 10008 || true)"
  if [ -n "$errors" ]; then echo "errors in $LOG:"; cut -c1-300 <<<"$errors" | tail -5; break; fi
  if grep -qE 'Ready! Logged in as|Bot is now online and ready' <<<"$new"; then ok=1; break; fi
done

if [ "$ok" = 1 ]; then
  echo "== deploy OK: raymond:$TAG"
  docker image prune -f >/dev/null
  exit 0
fi

echo "== FAILED, container output:"; docker logs --since "$START" --tail 60 raymond-bot-1 2>&1 || true
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then
  echo "== f. rolling back to raymond:$PREV_TAG (DB backup: $BACKUP)"
  compose "$PREV_TAG" up -d bot
else
  echo "no previous image to roll back to" >&2
fi
exit 1
