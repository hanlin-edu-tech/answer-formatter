#!/bin/bash

VERSION="0.0.38"
S3_BUCKET="tw-itembank-sandbox"
UPLOAD_PATH="v1/api/answerFormatter"

while getopts 'e:' OPT; do
  case $OPT in
    e)
      if [ $OPTARG == "prod" ]; then
        S3_BUCKET="itembank"
      fi
      ;;
    ?)
      ;;
  esac
done

aws s3 sync ./lib s3://${S3_BUCKET}/${UPLOAD_PATH}/${VERSION} --region ap-east-2 --acl public-read
aws s3 sync ./lib s3://${S3_BUCKET}/${UPLOAD_PATH}/latest --region ap-east-2 --acl public-read
