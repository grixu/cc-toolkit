#!/bin/sh
for f in src/*.sh; do
  sh -n "$f" || exit 1
done
echo "lint ok"
