#!/bin/bash

BUCKET="question-item-api-test"
TEST_PAGE_DESTINATION_DIR="question-item-api-test/answer-formatter-test"
API_DESTINATION_DIR="question-item-api-test/dist"
MODULE_DESTINATION_DIR="question-item-api-test/node_modules"
CACHE_CONTROL="no-cache, max-age=0"

gsutil -h "Cache-Control:$CACHE_CONTROL" cp test/index.html gs://$BUCKET/$TEST_PAGE_DESTINATION_DIR/index.html
gsutil -h "Cache-Control:$CACHE_CONTROL" cp dist/answerFormatter.umd.js gs://$BUCKET/$API_DESTINATION_DIR/answerFormatter.umd.js
