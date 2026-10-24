#!/bin/sh
for f in infra/*.tf; do
  test -s "$f" || { echo "empty: $f"; exit 1; }
done
echo "check ok"
