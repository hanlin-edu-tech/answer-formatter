#!/bin/bash
ENV="test"
VERSION="0.0.2"  # Needs to be set when building manually

DOCKERFILE_PATH="."
DOCKERFILE="Dockerfile"
TAG="latest-SNAPSHOT"

GCP_PROJECT_ID="tutor-test-238709"
GCP_REGION="asia-east1"
GCP_AR_REPO="answer-formatter"
GCP_AR_IMAGE_NAME="${GCP_AR_REPO}/script"

while getopts 'e:v:' OPT; do
  case $OPT in
    e)
      if [ $OPTARG == "prod" ]; then
        ENV="prod"
        TAG="latest"
        GCP_PROJECT_ID="tutor-204108"
      fi
      ;;
    v)
      VERSION=$OPTARG
      ;;
  esac
done

if [ $ENV == "test" ]; then
  VERSION=${VERSION}-SNAPSHOT
fi

GCP_IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_AR_IMAGE_NAME}"

docker build --platform linux/amd64 . -t ${GCP_IMAGE_URI}:${TAG} -t ${GCP_IMAGE_URI}:${VERSION} -f ${DOCKERFILE_PATH}/${DOCKERFILE} --build-arg MODE=${ENV}
# gcloud auth configure-docker ${GCP_REGION}-docker.pkg.dev
# docker push ${GCP_IMAGE_URI}:${TAG}
# docker push ${GCP_IMAGE_URI}:${VERSION}
