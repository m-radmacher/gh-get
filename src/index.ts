import { Octokit } from "octokit";
import * as fs from "fs";
import path from "path";

type Configuration = {
  owner?: string;
  repo?: string;
  artifactName?: string;
  workflowId?: string;
  outputPath?: string;
  pat?: string;
  overwrite?: boolean;
};

const logFile = fs.createWriteStream(path.join("debug.log"), { flags: "w" });
function log(str: unknown) {
  console.log(str);
  logFile.write(str + "\n");
}

async function run() {
  const config: Configuration = {};
  const args = process.argv;

  for (const arg of args) {
    const argParts = arg.split("=");
    switch (argParts[0]) {
      case "-r":
      case "--repository":
        config.repo = argParts[1];
        break;
      case "-u":
      case "--user":
        config.owner = argParts[1];
        break;
      case "-a":
      case "--artifact":
        config.artifactName = argParts[1];
        break;
      case "-w":
      case "--workflow":
        config.workflowId = argParts[1];
        break;
      case "-o":
      case "--output":
        config.outputPath = argParts[1];
        break;
      case "-p":
      case "--pat":
        config.pat = argParts[1];
        break;
      case "-v":
      case "--overwrite":
        if (argParts[1] === null || argParts[1] === undefined) {
          config.overwrite = true;
        } else {
          config.overwrite = Boolean(argParts[1]);
        }
        break;
      default:
        log("Unknown arguement: " + argParts[0]);
        break;
    }
  }

  if (!config.artifactName) {
    log("Artifact name is not set.");
    return;
  }
  if (!config.outputPath) {
    log("Output path is not set.");
    return;
  }
  if (!config.owner) {
    log("Owner is not set.");
    return;
  }
  if (!config.pat) {
    log("Person access token is not set.");
    return;
  }
  if (!config.repo) {
    log("Repository is not set.");
    return;
  }
  if (!config.workflowId) {
    log("Workflow id is not set.");
    return;
  }

  const octokit = new Octokit({
    auth: config.pat,
  });

  // Get the requested workflow
  const { data: workflow } = await octokit.rest.actions.getWorkflow({
    owner: config.owner,
    repo: config.repo,
    workflow_id: config.workflowId,
  });

  // Get the ID of the latest workflow run
  const { data: workflowRuns } = await octokit.rest.actions.listWorkflowRuns({
    owner: config.owner,
    repo: config.repo,
    workflow_id: workflow.id,
  });

  // find the latest workflow run
  let highestRunNumber = 0;
  let runId;
  for (const run of workflowRuns.workflow_runs) {
    if (run.status !== "completed") continue;
    if (run.run_number > highestRunNumber) {
      highestRunNumber = run.run_number;
      runId = run.id;
    }
  }

  if (!runId) {
    log("Could not find any workflow runs.");
    return;
  }

  const { data: artifacts } = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner: config.owner,
    repo: config.repo,
    run_id: runId,
  });

  let artifact;
  for (const af of artifacts.artifacts) {
    if (af.name === config.artifactName) {
      artifact = af;
    }
  }

  if (!artifact) {
    throw new Error("Could not find artifact.");
  }

  const { data: file } = await octokit.rest.actions.downloadArtifact({
    owner: config.owner,
    repo: config.repo,
    artifact_id: artifact.id,
    archive_format: "zip",
  });

  if (config.overwrite) {
    // overwrite old file
    try {
      const completeOutputPath = path.join(config.outputPath, `${config.artifactName}.zip`);
      if (fs.existsSync(completeOutputPath)) {
        fs.rmSync(completeOutputPath); // remove old file if it exists
      }
      fs.appendFileSync(completeOutputPath, Buffer.from(file as ArrayBuffer));
    } catch (err) {
      log(err);
    }
  } else {
    // create new file
    try {
      fs.appendFileSync(
        path.join(config.outputPath, `${config.artifactName}-${highestRunNumber}.zip`),
        Buffer.from(file as ArrayBuffer),
      );
    } catch (err) {
      log(err);
    }
  }
}

run();
