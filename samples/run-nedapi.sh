#!/bin/bash

cd $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

cd ../app && meteor --settings ../samples/settings-nedapi.json --raw-logs
