#!/bin/bash
# Start server in background, POST a review, check it doesn't crash
PORT=47199
VSCODE_REVIEW_PORT=$PORT bun channel/server.ts &
SERVER_PID=$!
sleep 1

# POST a test review
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:$PORT/review \
  -H "Content-Type: text/plain" \
  -d "# Test Review")

kill $SERVER_PID 2>/dev/null

if [ "$RESPONSE" = "200" ]; then
  echo "PASS: server accepted POST /review"
  exit 0
else
  echo "FAIL: expected 200, got $RESPONSE"
  exit 1
fi
