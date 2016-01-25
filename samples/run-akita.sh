#!/bin/sh

cd $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

cd ../app && meteor --settings ../samples/settings-akita.json --raw-logs
