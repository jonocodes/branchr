#!/bin/bash

# set -x

MODE=$1

cd $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

LOCAL_GIT=/tmp/branchr-test-app

if [ ! -d $LOCAL_GIT ]; then
  git clone git@github.com:jonocodes/lcd-test-app.git $LOCAL_GIT
fi

cp demo-compose.yml /tmp/demo-compose.yml

if [ "$MODE" == "dev" ]; then

  cd ../app && meteor --settings ../demo/settings-dev.json --raw-logs

elif [ "$MODE" == "docker" ]; then

  COMPOSE="docker-compose -f ../app/docker-compose.yml"

  export METEOR_SETTINGS=$(cat settings-docker.json)
  export GIT_DIR=$LOCAL_GIT
  export APP_COMPOSE=/tmp/demo-compose.yml

  $COMPOSE kill
  $COMPOSE build
  $COMPOSE up

else
  echo "Invalid mode specified"
fi
