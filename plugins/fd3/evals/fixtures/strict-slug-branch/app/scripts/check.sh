#!/bin/sh
for f in src/*.ts; do
  test -s "$f" || { echo "empty: $f"; exit 1; }
done
echo "check ok"
