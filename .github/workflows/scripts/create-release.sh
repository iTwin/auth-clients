#!/bin/bash

if [ -z "$1" ]; then
  echo "No refName was supplied"
  exit 1
fi

refName=$1
echo "Ref name passed in: $refName"

tagName=$(echo $refName | sed 's/refs\/tags\///')
echo "Tag name was parsed as: $tagName"

# TODO: uncomment once verified working
# gh release create $tagName /packages/service --verify-tag

gh release create @itwin/service-authorization_v1.2.3 ./packages/service --verify-tag
