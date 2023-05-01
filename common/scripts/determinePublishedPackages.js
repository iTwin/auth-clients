/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Determines which packages in monorepo are pending publish.
 * Why? Because Rush publishes any packages whose versions have bumped
 * but doesn't provide an easy way to know which.
 *
 * We'd like to know so we can determine which package's docs to publish.
 */

const fs = require("fs");

if (!process.argv[2] || !process.argv[3])
  throw new Error(
    "Please provide before and after snapshot paths: `rush list --json > filename.txt`"
  );

const beforeFilePath = process.argv[2];
const afterFilePath = process.argv[3];

const beforeSnapshot = rushOutputToJSON(beforeFilePath);
const afterSnapshot = rushOutputToJSON(afterFilePath);

afterSnapshot.projects.forEach((afterProject) => {
  const beforeProject = beforeSnapshot.projects.find(
    (p) => p.name === afterProject.name && p.version !== afterProject.version
  );

  const shortProjectName = afterProject.name
    .replace("@itwin/", "")
    .replace("-authorization", "");

  if (beforeProject) {
    console.log(
      `package ${afterProject.name} has updated from version ${beforeProject.version} to ${afterProject.version} - short name ${shortProjectName}`
    );
  }

  console.log(
    `Outputting variable for ${shortProjectName} - ${!!beforeProject}`
  );

  outputVSOVariable(shortProjectName, !!beforeProject);
});

function rushOutputToJSON(fileName) {
  const txtFile = fs.readFileSync(fileName, "utf-8");
  const jsonOnly = txtFile.replace(/The rush\.json [^{]+/, "");
  const jsonFile = JSON.parse(jsonOnly);

  return jsonFile;
}

function outputVSOVariable(variableName, value) {
  console.log(
    `##vso[task.setvariable variable=${variableName};isOutput=true]${value}`
  );
}
