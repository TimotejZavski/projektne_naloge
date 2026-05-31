#!/usr/bin/env bash
# End-to-end smoke test for the Mosquitto broker (SCRUM-37).
#
# Verifies that the broker stands up using SA/mqtt/mosquitto.conf and
# that the full integration contract holds:
#
#   1. The standalone compose file is structurally valid.
#   2. The eclipse-mosquitto:2.0 image is pullable.
#   3. The broker reads our config (both listeners — MQTT 1883 and
#      WebSocket 9001 — appear in the startup log).
#   4. A wildcard subscription against the documented smart-playgrounds/
#      prefix receives a published message byte-for-byte.
#   5. The WebSocket port is reachable on the Docker network (TCP-level
#      reachability check; full WS handshake is harder to script in
#      portable shell and is covered by the production browser client).
#
# All resources are namespaced with $$-$RANDOM so multiple runs in
# parallel never collide. trap-on-EXIT removes the broker container,
# subscriber container, and network even on Ctrl-C or partial failure.
#
# Usage:
#   bash SA/mqtt/scripts/smoke-test.sh
#
# Requirements:
#   - docker on PATH and the daemon running
#   - outbound internet for the first eclipse-mosquitto and alpine pulls

set -euo pipefail

# ---- configuration --------------------------------------------------

SUFFIX=$$-$RANDOM
NET="sp-mqtt-smoke-net-${SUFFIX}"
BROKER="sp-mqtt-smoke-broker-${SUFFIX}"
SUB_CONTAINER="sp-mqtt-smoke-sub-${SUFFIX}"

MQTT_IMAGE="eclipse-mosquitto:2.0"
ALPINE_IMAGE="alpine:3.20"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MQTT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONF_PATH="${MQTT_ROOT}/mosquitto.conf"
COMPOSE_PATH="${MQTT_ROOT}/docker-compose.yml"

# ---- helpers --------------------------------------------------------

step() { printf '\n\033[1;36m[smoke %s]\033[0m %s\n' "$1" "$2"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\n\033[1;31m[smoke FAIL]\033[0m %s\n' "$1" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

cleanup() {
  local code=$?
  printf '\n\033[1;33m[smoke cleanup]\033[0m removing throwaway resources...\n'
  docker rm -f "$SUB_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$BROKER"        >/dev/null 2>&1 || true
  docker network rm "$NET"      >/dev/null 2>&1 || true
  exit $code
}
trap cleanup EXIT

# ---- preflight ------------------------------------------------------

require_cmd docker
docker info >/dev/null 2>&1 || die "docker daemon is not reachable"
[ -f "$CONF_PATH" ]    || die "mosquitto.conf not found at $CONF_PATH"
[ -f "$COMPOSE_PATH" ] || die "docker-compose.yml not found at $COMPOSE_PATH"

# ---- step 1: validate compose file ----------------------------------

step "1/7" "validate standalone docker-compose.yml is well-formed"
if ! docker compose -f "$COMPOSE_PATH" config >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_PATH" config >&2 || true
  die "docker compose config rejected $COMPOSE_PATH"
fi
ok "compose file is structurally valid"

# ---- step 2: image present ------------------------------------------

step "2/7" "ensure broker image is available locally"
docker pull -q "$MQTT_IMAGE" >/dev/null
ok "$MQTT_IMAGE"

# ---- step 3: network + broker ---------------------------------------

step "3/7" "start broker with bind-mounted SA/mqtt/mosquitto.conf"
docker network create "$NET" >/dev/null
docker run -d --rm \
  --name "$BROKER" \
  --network "$NET" --network-alias mosquitto \
  -v "$CONF_PATH:/mosquitto/config/mosquitto.conf:ro" \
  "$MQTT_IMAGE" >/dev/null
ok "broker container is running"

# ---- step 4: wait for broker to accept connections ------------------

step "4/7" "wait for broker to accept CONNECT on port 1883"
printf "  waiting"
for i in $(seq 1 30); do
  if docker run --rm --network "$NET" "$MQTT_IMAGE" \
        mosquitto_sub -h mosquitto -t '$SYS/#' -C 1 -W 1 \
        >/dev/null 2>&1; then
    printf "\n"
    ok "broker accepts MQTT CONNECT"
    break
  fi
  printf "."
  sleep 1
  [ "$i" -eq 30 ] && { printf "\n"; die "broker never became ready within 30s"; }
done

# ---- step 5: verify config was honored ------------------------------

step "5/7" "verify both listeners appear in broker startup logs"
BROKER_LOGS=$(docker logs "$BROKER" 2>&1)

if ! grep -qE "Opening ipv[46] listen socket on port 1883" <<<"$BROKER_LOGS"; then
  printf "%s\n" "$BROKER_LOGS" >&2
  die "MQTT listener on port 1883 not found in broker logs"
fi
ok "MQTT listener on port 1883 confirmed"

if ! grep -qE "Opening websockets listen socket on port 9001" <<<"$BROKER_LOGS"; then
  printf "%s\n" "$BROKER_LOGS" >&2
  die "WebSocket listener on port 9001 not found in broker logs"
fi
ok "WebSocket listener on port 9001 confirmed"

# ---- step 6: MQTT round-trip with the documented topic prefix -------

step "6/7" "pub/sub round-trip on smart-playgrounds/ wildcard"

PAYLOAD="canary-${SUFFIX}-$(date -u +%s)"
TOPIC="smart-playgrounds/devices/smoke-${SUFFIX}/sensors/canary"
WILDCARD="smart-playgrounds/devices/+/sensors/+"

# Background subscriber with single-message capture + 10s safety timeout.
docker run -d --name "$SUB_CONTAINER" --network "$NET" \
  "$MQTT_IMAGE" \
  mosquitto_sub -h mosquitto -t "$WILDCARD" -C 1 -W 10 >/dev/null

# Give the subscriber a moment to send CONNECT + SUBSCRIBE before publish.
sleep 2

docker run --rm --network "$NET" "$MQTT_IMAGE" \
  mosquitto_pub -h mosquitto -t "$TOPIC" -m "$PAYLOAD"

# Wait for the sub container to exit (either got the message or timed out).
SUB_EXIT=$(docker wait "$SUB_CONTAINER")
RECEIVED=$(docker logs "$SUB_CONTAINER" 2>&1 | tr -d '\r' | tail -n 1)

if [ "$SUB_EXIT" != "0" ]; then
  die "subscriber exited non-zero ($SUB_EXIT); likely no message received within 10s"
fi
if [ "$RECEIVED" != "$PAYLOAD" ]; then
  die "received '$RECEIVED' != expected '$PAYLOAD'"
fi
ok "wildcard sub on '$WILDCARD' received '$PAYLOAD'"

# ---- step 7: WebSocket port reachability ----------------------------

step "7/7" "TCP-level reachability of WebSocket port 9001"

# alpine's busybox nc supports -z (zero-IO scan) and -w (timeout in s).
if ! docker run --rm --network "$NET" "$ALPINE_IMAGE" \
      sh -c "nc -z -w 3 mosquitto 9001" >/dev/null 2>&1; then
  die "TCP connect to mosquitto:9001 failed"
fi
ok "TCP connect to mosquitto:9001 succeeded"

# ---- done -----------------------------------------------------------

printf '\n\033[1;32m[smoke PASS]\033[0m broker integration verified end-to-end.\n'
