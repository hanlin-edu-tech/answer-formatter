#!/bin/bash

VERSION="0.0.0"
S3_BUCKET="tw-itembank-sandbox"
UPLOAD_PATH="v1/api/answerFormatter"
REGION="ap-east-2"

while getopts 'e:' OPT; do
  case $OPT in
    e)
      if [ $OPTARG == "prod" ]; then
        S3_BUCKET="itembank"
        REGION="ap-southeast-1"
      fi
      ;;
    ?)
      ;;
  esac
done

aws s3 cp ./dist/answerFormatter.js s3://${S3_BUCKET}/${UPLOAD_PATH}/${VERSION}/answerFormatter.js --region ${REGION} --acl public-read
aws s3 cp ./dist/answerFormatter.js s3://${S3_BUCKET}/${UPLOAD_PATH}/latest/answerFormatter.js --region ${REGION} --acl public-read
