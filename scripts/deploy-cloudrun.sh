#!/bin/bash
ENV="test"
VERSION="0.0.0"  # Needs to be set when building manually

SERVICE_NAME="answer-formatter-script"
PROJECT_ID="tutor-test-238709"
LOCATION="asia-east1"
TAG="latest-SNAPSHOT"

IMAGE_NAME="answer-formatter/script"

while getopts "e:v:" OPT; do
  case $OPT in
    e)
      if [ $OPTARG == "prod" ]; then
        ENV="prod"
        PROJECT_ID="tutor-204108"
        TAG="latest"
      fi
      ;;
    v)
      VERSION=$OPTARG
      ;;
    ?)
      ;;
  esac
done

IMAGE_FULL_NAME="${LOCATION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_NAME}"

gcloud run deploy ${SERVICE_NAME} --image ${IMAGE_FULL_NAME}:${TAG} --region ${LOCATION} --project ${PROJECT_ID} --allow-unauthenticated
# gcloud run deploy ${SERVICE_NAME} --image ${IMAGE_FULL_NAME}:${VERSION} --region ${LOCATION} --project ${PROJECT_ID} --allow-unauthenticated
