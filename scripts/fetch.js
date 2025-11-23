import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";
import { Octokit } from "@octokit/rest";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TEMP_PARENT = path.join(ROOT_DIR, ".tmp");

const TOKEN = process.env.GITHUB_TOKEN;

async function fileExists(targetPath) {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadManifest() {
    const manifestPath = path.join(ROOT_DIR, "manifest.yaml");
    const raw = await fsp.readFile(manifestPath, "utf8");
    const data = yaml.load(raw);
    return { path: manifestPath, data };
}

function normalizeGithubConfig(manifest) {
  if (!manifest?.fetch?.github) {
    throw new Error("Missing fetch.github configuration in manifest");
  }

  const { repo, branch = "main", folders, dest } = manifest.fetch.github;
  if (!repo || typeof repo !== "string" || !repo.includes("/")) {
    throw new Error('fetch.github.repo must be a string in the format "owner/name"');
  }

  const [owner, repoName] = repo.split("/");

  let folderList = folders ?? [];
  if (!Array.isArray(folderList)) {
    folderList = [folderList];
  }

  folderList = folderList
    .filter((entry) => entry !== undefined && entry !== null && `${entry}`.trim().length > 0)
    .map((entry) => {
      if (typeof entry !== "string") {
        throw new Error("fetch.github.folders entries must be strings");
      }

      const trimmed = entry.trim().replace(/^[./\\]+/, "");
      if (path.isAbsolute(trimmed)) {
        throw new Error("fetch.github.folders must be relative paths");
      }
      if (trimmed.split(path.sep).includes("..")) {
        throw new Error("fetch.github.folders cannot contain '..'");
      }
      return trimmed;
    });

  const destPath = path.resolve(ROOT_DIR, dest ?? repoName);
  if (!destPath.startsWith(ROOT_DIR)) {
    throw new Error(`Destination "${destPath}" must be inside the project root`);
  }
  if (destPath === ROOT_DIR) {
    throw new Error("Refusing to use project root as destination");
  }

  return {
    owner,
    repoName,
    branch,
    folders: folderList,
    destPath,
  };
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function prepareTempDir() {
  await ensureDir(TEMP_PARENT);
  return fsp.mkdtemp(path.join(TEMP_PARENT, "fetch-"));
}

function createOctokit() {
  if (TOKEN) {
    console.log("Using GitHub token from environment");
    return new Octokit({ auth: TOKEN });
  }
  return new Octokit();
}

async function downloadArchive({ octokit, owner, repo, ref, targetPath }) {
  console.log(`Downloading ${owner}/${repo}@${ref}...`);
  const response = await octokit.rest.repos.downloadZipballArchive({
    owner,
    repo,
    ref,
  });

  const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
  await fsp.writeFile(targetPath, buffer);
  console.log(`Saved archive to ${targetPath}`);
}

async function extractArchive(zipPath, tempDir, repoName) {
  console.log("Extracting archive...");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  const entries = await fsp.readdir(tempDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (!dirs.length) {
    throw new Error("No directories found after extracting archive");
  }

  const repoDir =
    dirs.find((dir) => dir.name.toLowerCase().includes(repoName.toLowerCase())) ?? dirs[0];
  const extractedRoot = path.join(tempDir, repoDir.name);
  console.log(`Archive extracted to ${extractedRoot}`);
  return extractedRoot;
}

async function resetDestination(destPath) {
  await fsp.rm(destPath, { recursive: true, force: true });
  await ensureDir(destPath);
}

async function copyContents(srcDir, destDir) {
  await ensureDir(destDir);
  const entries = await fsp.readdir(srcDir);

  for (const entry of entries) {
    const from = path.join(srcDir, entry);
    const to = path.join(destDir, entry);
    await fsp.cp(from, to, { recursive: true, force: true });
  }
}

async function moveRequestedContent({ extractedRoot, folders, destPath }) {
  await resetDestination(destPath);

  if (!folders.length) {
    console.log(`Copying entire repository into ${destPath}`);
    await copyContents(extractedRoot, destPath);
    return;
  }

  for (const folder of folders) {
    const folderPath = path.join(extractedRoot, folder);
    if (!(await fileExists(folderPath))) {
      throw new Error(`Folder "${folder}" not found in downloaded repository`);
    }

    console.log(`Copying ${folder}/ -> ${destPath}`);
    await copyContents(folderPath, destPath);
  }
}

async function main() {
  try {
    const manifest = await loadManifest();
    console.log(`Using manifest at ${manifest.path}`);
    const config = normalizeGithubConfig(manifest.data);

    const octokit = createOctokit();
    const tempDir = await prepareTempDir();
    const archivePath = path.join(tempDir, `${config.repoName}.zip`);

    try {
      await downloadArchive({
        octokit,
        owner: config.owner,
        repo: config.repoName,
        ref: config.branch,
        targetPath: archivePath,
      });

      const extractedRoot = await extractArchive(archivePath, tempDir, config.repoName);
      await moveRequestedContent({
        extractedRoot,
        folders: config.folders,
        destPath: config.destPath,
      });
      console.log("Fetch complete.");
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

main();
