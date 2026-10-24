#!/bin/sh
# Prints the queue status line the dashboard scrapes.
echo "pending=$(sh "$(dirname "$0")/queue.sh")"
