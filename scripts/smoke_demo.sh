#!/usr/bin/env bash
# Hits every endpoint for each demo ZIP; exits non-zero on any failure.
set -euo pipefail
BASE="${1:-http://localhost:8000}"
ZIPS=(94105 10001 60601 77002 85004 30303 80202 98104)

curl -sf "$BASE/api/v1/health" > /dev/null
for zip in "${ZIPS[@]}"; do
  curl -sf -X POST "$BASE/api/v1/baseline" -H 'Content-Type: application/json' \
       -d "{\"zip_code\":\"$zip\",\"building_type\":\"office\",\"floor_area_sqft\":50000}" > /dev/null
  curl -sf -X POST "$BASE/api/v1/optimize" -H 'Content-Type: application/json' \
       -d "{\"facility\":{\"zip_code\":\"$zip\",\"building_type\":\"warehouse\",\"floor_area_sqft\":120000},\"scenario\":{\"objective\":\"max_npv\"}}" > /dev/null
  curl -sf -X POST "$BASE/api/v1/resilience" -H 'Content-Type: application/json' \
       -d "{\"zip_code\":\"$zip\",\"building_type\":\"hospital\"}" > /dev/null
  echo "OK $zip"
done
echo "smoke passed"
