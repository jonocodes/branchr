#!/usr/bin/env bash

set -x

function get_docker_host {
  HOST="localhost"

  if boot2docker ip >/dev/null 2>&1 ; then
    HOST=$(boot2docker ip)
  elif docker-machine ip >/dev/null 2>&1 ; then
    HOST=$(docker-machine ip)
  fi

  echo $HOST
}

function process_template {
	INPUT=$1
  OUTPUT=$2

	echo "Processing template $INPUT"

  eval "cat <<EOF
$(<$INPUT)
EOF
" > $OUTPUT

  cat $OUTPUT
}

MODE=$1

cd $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

LOCAL_GIT=/tmp/branchr-test-app
SETTINGS=/tmp/branchr-settings.json

export SETTINGS_HOST=$(get_docker_host)

if [ ! -d $LOCAL_GIT ]; then
  git clone git@github.com:jonocodes/lcd-test-app.git $LOCAL_GIT
fi

cp demo-compose.yml /tmp/app-compose.yml

if [ "$MODE" == "dev" ]; then

  export SETTINGS_GIT=$LOCAL_GIT
  process_template settings-template.json $SETTINGS

  cd ../app && meteor --settings $SETTINGS --raw-logs

elif [ "$MODE" == "docker" ]; then

  COMPOSE="docker-compose --x-networking -f ../app/docker-compose.yml"

  export GIT_DIR=$LOCAL_GIT
  export APP_COMPOSE=/tmp/app-compose.yml

  export SETTINGS_GIT="/git"
  process_template settings-template.json $SETTINGS
  export METEOR_SETTINGS=$(cat $SETTINGS)

  $COMPOSE kill
  $COMPOSE build
  $COMPOSE up

else
  echo "Invalid mode specified"
fi
