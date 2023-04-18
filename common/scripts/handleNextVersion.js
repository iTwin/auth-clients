/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Renames nextVersion.md to {release tag}.md for any packages with minor version bumps.
 */

const fs = require("fs");
const path = require("path");

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

  const shortProjectName = afterProject
    .replace("@itwin/", "")
    .replace("-authorization", "");

  let added = false;
  if (beforeProject) {
    const updateType = determineSemverUpdateType(
      beforeProject.version,
      afterProject.version
    );

    console.log(
      `package ${afterProject.name} has updated (${updateType}) from version ${beforeProject.version} to ${afterProject.version}`
    );

    if (updateType === "Minor") {
      addReleaseNotesFromNextVersion(afterProject);
      added = true;
      return;
    }
  }

  outputVSOVariable(shortProjectName, added ? "True" : "false"); // odd VSO Syntax
});

function rushOutputToJSON(fileName) {
  const txtFile = fs.readFileSync(fileName, "utf-8");
  const jsonOnly = txtFile.replace(/The rush\.json [^{]+/, "");
  const jsonFile = JSON.parse(jsonOnly);

  return jsonFile;
}

function determineSemverUpdateType(oldVersion, updatedVersion) {
  const [oldMajor, oldMinor, oldPatch] = oldVersion.split(".");
  const [updatedMajor, updatedMinor, updatedPatch] = updatedVersion.split(".");

  if (oldMajor !== updatedMajor) return "Major";
  if (oldMinor !== updatedMinor) return "Minor";
  if (oldPatch !== updatedPatch) return "Patch";
}

function addReleaseNotesFromNextVersion(afterProject) {
  const tag = `${afterProject.name.replace("@itwin/", "")}_v${
    afterProject.version
  }`;

  // rename next version to tag
  const releaseNotesFolder = path.resolve(
    afterProject.fullPath,
    "release-notes"
  );
  const nextVersionMdPath = path.resolve(releaseNotesFolder, "nextVersion.md");
  const nextVersionMd = fs.existsSync(nextVersionMdPath);

  if (nextVersionMd) {
    const releaseNotesPath = path.resolve(releaseNotesFolder, `${tag}.md`);

    fs.renameSync(nextVersionMdPath, releaseNotesPath); // rename nextVersion to the release tag and
    replacePlaceholderHeader(releaseNotesPath, afterProject.version);
    fs.writeFileSync(nextVersionMdPath, "", "utf-8"); // erase current next version

    return releaseNotesPath;
  } else {
    throw new Error(
      `Attempting to update version ${afterProject.name} to ${afterProject.version} but nextVersion.md was not found: ${nextVersionMdPath}`
    );
  }
}

function replacePlaceholderHeader(filePath, newVersion) {
  let contents = fs.readFileSync(filePath, "utf-8");
  contents = contents.replace("Next Version", `${newVersion} Release Notes`);
  fs.writeFileSync(filePath, contents, "utf-8");
}

function outputVSOVariable(variableName, value) {
  console.log(`##vso[task.setvariable variable=${variableName};]${value}`); // match VSO casing...
}
