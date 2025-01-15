#!/bin/bash

if [ -z "$1" ]; then
  echo "No refName was supplied"
  exit 1
fi

refName=$1
echo "Ref name passed in: $refName"

tagName=$(echo $refName | sed 's/refs\/tags\///')
echo "Tag name was parsed as: $tagName"
packageName=$(echo $tagName | sed 's/_v.*//')
echo "Package name was parsed as: $packageName"
packageVersion=$(echo $tagName | sed 's/.*_v//')
echo "Package version was parsed as: $packageVersion"

# The packageDirectory variable is determined by searching the ./packages directory for a subdirectory
# that contains a package.json file with a name matching the parsed packageName.
# determine package directory so that we can zip it up and also find the changelog
packageDirectory=$(find ./packages -maxdepth 1 -type d | while read dir; do
  if [ -f "$dir/package.json" ]; then
    packageNameInJson=$(jq -r '.name' "$dir/package.json")
    if [ "$packageNameInJson" == "$packageName" ]; then
      echo "$dir"
      break
    fi
  fi
done)

if [ -z "$packageDirectory" ]; then
  echo "No package directory found for package name: $packageName"
  exit 1
else
  echo "Package directory was determined as: $packageDirectory"
fi

changelogMd="$packageDirectory/CHANGELOG.md"

if [ ! -f "$changelogMd" ]; then
  echo "Changelog file not found: $changelogMd"
  exit 1
fi

# Extract the changelog text
releaseNoteText=$(awk -v version="$packageVersion" '$0 ~ version {flag=1; print; next} /^## /{flag=0} flag' "$changelogMd")
echo "Release note text was extracted as: $releaseNoteText"

# remove the @itwin/ or @bentley/ scope from the tag name to create the zip file name since they have special characters
zipFileName=$(echo "$tagName" | sed 's/@itwin\///; s/@bentley\///')
echo "Zip file name was parsed as: $zipFileName"

# Zip the package directory with just the specific package
zip -r "$zipFileName.zip" "$packageDirectory"
tar -czvf "$zipFileName.tar.gz" "$packageDirectory"

# Create a release and upload assets
gh release create "$tagName" \
  "$zipFileName.zip" \
  "$zipFileName.tar.gz" \
  --notes "$releaseNoteText" \
  --verify-tag
