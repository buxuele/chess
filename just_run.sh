#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
exec ./desktop/build.sh --run
