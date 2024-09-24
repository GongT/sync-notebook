#!/usr/bin/env bash
set -Eeuo pipefail

declare -r Question=$1
echo "question: ${Question}">&2

RESULT=$("${IPC_NODEJS_PATH}" "${IPC_SCRIPT_FILE}" "${Question}")

echo "$RESULT"
