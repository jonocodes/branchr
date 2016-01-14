#!/bin/sh

set -x

COMPOSE="docker-compose -f ../app/demo-compose.yml"
LOCAL_GIT=/tmp/lcd-test-app

if [ ! -d $LOCAL_GIT ];
  then

  git clone git@github.com:jonocodes/lcd-test-app.git $LOCAL_GIT

  if [ ! -d $LOCAL_GIT ]; then die "git clone failed"; fi
fi

export METEOR_SETTINGS=$(cat settings-docker.json)
export GIT_DIR=$LOCAL_GIT
export APP_COMPOSE=$(pwd)/docker-compose.yml

$COMPOSE kill
$COMPOSE build
$COMPOSE up
