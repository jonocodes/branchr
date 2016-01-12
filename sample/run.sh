#!/bin/sh

set -x

cd ../app && meteor --settings ../sample/settings.json --raw-logs
