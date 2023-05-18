# Adapted from https://github.com/iTwin/itwinjs-core/blob/master/common/scripts/create_release.py
import glob
import json
import os
import re
import subprocess
import sys


def getSHAFromTag(tag):
    cmd = ['git', 'rev-list', '-n', '1', tag]
    proc = subprocess.Popen(
        " ".join(cmd), stdin=subprocess.PIPE, stdout=subprocess.PIPE, shell=True)
    sha = proc.communicate()[0].decode("utf-8").strip()
    if len(sha) == 0:
        sys.exit("Could not find commit for tag '{0}'".format(tag))
    return sha


def getCommitMessage(sha):
    cmd = ['git', 'log', '-1', '--format=%s', sha]
    proc = subprocess.Popen(
        " ".join(cmd), stdin=subprocess.PIPE, stdout=subprocess.PIPE, shell=True)
    commitMessage = proc.communicate()[0].decode("utf-8").strip()
    if len(commitMessage) == 0:
        sys.exit("Could not find info for commit " + sha)

    # If commit message contains multiple PR links (in case of backports), remove the earlier one
    pattern = " \(#\d+\)"
    if len(re.findall(pattern, commitMessage)) > 1:
        commitMessage = re.sub(pattern, "", commitMessage, 1)
    return commitMessage


def createRelease(tag):
    # for auth-clients, tag has format @itwin/packageName_v0.13.0
    tagParts = tag.split("_v")
    currentVer = tagParts[1]
    packageName = tagParts[0]
    currentTag = tag.split("/")[1]
    print("current ver: {0} / currentTag: {1} / packageName: {2}".format(
        currentVer, currentTag, packageName))
    changeLogFileName = ""

    # If not in lockstep, we need to identify the folder with the package we're interested in
    # Look for all package.json files and find the one with a name which matches the input tag
    results = glob.glob("**/package.json", recursive=True)
    results = filter(lambda x: not re.search("node_modules", x), results)
    packageBaseDirectory = ""
    for result in results:
        fullPath = os.path.join(os.getcwd(), result)
        with open(fullPath) as json_file:
            packageJson = json.load(json_file)
            packageJsonName = packageJson["name"]

            if packageJsonName == packageName:
                packageBaseDirectory = os.path.dirname(fullPath)
                changeLogFileName = "{0}/CHANGELOG.md".format(
                    packageBaseDirectory)
                print("Found CHANGELOG.md: {0} matching: {1} at: {2}".format(
                    packageJsonName, packageName, packageBaseDirectory))

                break

    print("Publishing GitHub release using notes from {0}".format(
        changeLogFileName))
    if not os.path.exists(changeLogFileName):
        raise Exception(
            "Attempting to create release with notes from file {0}, but the file does not exist".format(changeLogFileName))

    latest_changes = ""
    with open(changeLogFileName, 'r') as file:
        changelog = file.read()

        # Find the latest version and changes
        latest_version = re.findall(r'## (\d+\.\d+\.\d+)\n', changelog)[0]
        latest_changes = re.findall(
            r'## ' + latest_version + r'([\s\S]*?)(?=## \d+\.\d+\.\d+|\Z)', changelog)[0]

        # Print the latest version and changes
        print("Latest Version: " + latest_version)
        print("Latest Changes:\n" + latest_changes)

    cmd = ['gh', 'release', 'create', tag, '-n',
           '"{0}"'.format(latest_changes), '-t', '"{0}"'.format(tag)]

    proc = subprocess.Popen(
        " ".join(cmd), stdin=subprocess.PIPE, stdout=subprocess.PIPE, shell=True)
    proc.wait()


# Validate arguments
if len(sys.argv) != 2:
    sys.exit("Invalid number of arguments to script provided.\nExpected: 1\nReceived: {0}".format(
        len(sys.argv) - 1))

releaseTag = sys.argv[1]
print("Creating release for " + releaseTag)
createRelease(releaseTag)
