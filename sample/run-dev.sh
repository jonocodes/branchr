#!/bin/sh

set -x

LOCAL_GIT=/tmp/lcd-test-app

# Make sure they have docker-compose and meteor installed

if [ ! -d $LOCAL_GIT ];
  then

  git clone git@github.com:jonocodes/lcd-test-app.git $LOCAL_GIT

  if [ ! -d $LOCAL_GIT ]; then die "git clone failed"; fi
fi

cp demo-compose.yml /tmp/demo-compose.yml

cd ../app && meteor --settings ../sample/settings-dev.json --raw-logs
