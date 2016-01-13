#!/bin/sh

set -x

# export METEOR_SETTINGS=$(cat ../sample/settings.json)
# cd ../app &&  meteor --raw-logs

cd ../app && meteor --settings ../sample/settings.json --raw-logs
