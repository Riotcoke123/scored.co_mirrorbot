const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const fse = require("fs-extra");
const dotenv = require("dotenv");
const { exec } = require("child_process");

dotenv.config();

// ----------------- CONFIGURATION -----------------
const {
  X_API_KEY,
  X_API_PLATFORM,
  X_API_SECRET,
  X_XSRF_TOKEN,
  REFERER,
  USER_AGENT,
  COMMUNITIES = "SpicTank",
  COMMENT_PARENT_ID = "0",
  POLL_INTERVAL = 300000, // 5 minutes
  MAX_CONCURRENT_DOWNLOADS = 5,
} = process.env;

const communityList = COMMUNITIES.split(",").map((c) => c.trim());

const requiredEnv = ["X_API_KEY", "X_API_PLATFORM", "X_API_SECRET", "X_XSRF_TOKEN"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Error: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const FILEDITCH_UPLOAD_URL = "https://up1.fileditch.com/upload.php";
const SCORED_COMMENT_URL = "https://api.scored.co/api/v2/action/create_comment";
const PROCESSED_FILE = path.join(__dirname, "processed_posts.json");
const WATERMARK_PATH = path.join(__dirname, "logo.png");

const SKIPPED_DOMAINS = [
  "parti.com",
  "kick.com",
  "youtube.com",
  "tiktok.com",
  "youtu.be",
  "twitter.com",
  "rumble.com",
  "twitch.tv",
  "dlive.tv",
  "instagram.com",
];
const MEDIA_REGEX = /\.(mp4|jpe?g|png|gif|webp)($|\?)/i;

// ----------------- HELPERS -----------------
function buildScoredHeaders() {
  return {
    "x-api-key": X_API_KEY,
    "x-api-platform": X_API_PLATFORM,
    "x-api-secret": X_API_SECRET,
    "x-xsrf-token": X_XSRF_TOKEN,
    referer: REFERER,
    "user-agent": USER_AGENT,
    "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };
}

async function fetchJson(url, headers) {
  const res = await axios.get(url, { headers, timeout: 20000 });
  return res.data;
}

function ensureDir(dir) {
  fse.ensureDirSync(dir);
}

async function downloadToFile(url, destPath, headers = {}) {
  const writer = fs.createWriteStream(destPath);
  const res = await axios.get(url, { responseType: "stream", headers, timeout: 60000 });
  return new Promise((resolve, reject) => {
    res.data.pipe(writer);
    let error = null;
    writer.on("error", (err) => {
      error = err;
      writer.close();
      reject(err);
    });
    writer.on("close", () => {
      if (!error) resolve(destPath);
    });
  });
}

function findAllMedia(post) {
  const urls = new Set();
  if (post?.link) urls.add(post.link);
  if (post?.media?.url) urls.add(post.media.url);
  if (post?.url) urls.add(post.url);
  if (Array.isArray(post.gallery))
    post.gallery.forEach((item) => {
      if (item?.url) urls.add(item.url);
    });

  if (urls.size === 0) {
    function walk(x) {
      if (!x) return;
      if (typeof x === "string" && x.startsWith("http")) urls.add(x);
      else if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === "object") Object.values(x).forEach(walk);
    }
    walk(post);
  }

  return Array.from(urls).filter((u) => {
    if (!MEDIA_REGEX.test(u)) return false;
    try {
      const urlObj = new URL(u);
      const urlHost = urlObj.hostname.replace(/^www\./, "");
      return !SKIPPED_DOMAINS.some((domain) => urlHost.endsWith(domain));
    } catch (e) {
      console.error("Invalid URL:", u);
      return false;
    }
  });
}

async function uploadFilesToFileDitch(filePaths) {
  const form = new FormData();
  filePaths.forEach((fp) => form.append("files[]", fs.createReadStream(fp)));
  const res = await axios.post(FILEDITCH_UPLOAD_URL, form, {
    headers: form.getHeaders(),
    timeout: 120000,
  });
  return res.data;
}

function extractMirrorUrl(data) {
  if (!data?.files?.[0]?.url) {
    console.error("Could not find a valid URL in FileDitch response:", data);
    return null;
  }
  return data.files[0].url;
}

async function postComment(content, parentId, community) {
  const headers = buildScoredHeaders();
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  const params = new URLSearchParams({
    content,
    parentId: String(parentId),
    commentParentId: String(COMMENT_PARENT_ID),
    community,
  });

  const res = await axios.post(SCORED_COMMENT_URL, params.toString(), { headers });
  return res.data;
}

async function addWatermarkToVideo(inputPath, outputPath, watermarkPath) {
  if (!fs.existsSync(watermarkPath)) {
    console.error("Watermark file not found:", watermarkPath);
    throw new Error("Watermark file not found.");
  }
  console.log("Adding watermark to video...");
  return new Promise((resolve, reject) => {
    const command = `ffmpeg -i "${inputPath}" -i "${watermarkPath}" -filter_complex "[1:v]scale=300:300[logo];[0:v][logo]overlay=x=10:y=10" -c:a copy "${outputPath}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`FFmpeg error: ${stderr}`);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

// ----------------- PROCESSED POSTS -----------------
function ensureProcessedPostsFile() {
  if (!fs.existsSync(PROCESSED_FILE)) {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify({}, null, 2), "utf8");
    console.log("Created new processed_posts.json file.");
  }
}

function loadProcessedPosts() {
  ensureProcessedPostsFile();
  try {
    return JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
  } catch (e) {
    console.error("Error reading processed_posts.json. Starting fresh.", e);
    return {};
  }
}

function saveProcessedPosts(obj) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(obj, null, 2), "utf8");
}

// ----------------- CLEANUP FUNCTION -----------------
async function enforceMaxFiles(downloadDir, maxVideos = 2, maxImages = 5) {
  const files = await fse.readdir(downloadDir);

  const videos = files
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => ({ name: f, time: fs.statSync(path.join(downloadDir, f)).mtimeMs }))
    .sort((a, b) => a.time - b.time);

  const images = files
    .filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f))
    .map((f) => ({ name: f, time: fs.statSync(path.join(downloadDir, f)).mtimeMs }))
    .sort((a, b) => a.time - b.time);

  while (videos.length > maxVideos) {
    const oldest = videos.shift();
    await fse.remove(path.join(downloadDir, oldest.name));
    console.log(`Deleted old video: ${oldest.name}`);
  }

  while (images.length > maxImages) {
    const oldest = images.shift();
    await fse.remove(path.join(downloadDir, oldest.name));
    console.log(`Deleted old image: ${oldest.name}`);
  }
}

// ----------------- PROCESS POSTS -----------------
async function processPosts(posts, processedPosts, community) {
  const downloadDir = path.join(__dirname, "downloads");
  ensureDir(downloadDir);

  if (!processedPosts[community]) processedPosts[community] = [];

  for (const post of posts) {
    const postId = post.id;

    // ----------------- DOUBLE POST PREVENTION -----------------
    if (processedPosts[community].includes(postId)) continue;

    console.log(`\nProcessing post: ${postId} (Community: ${community})`);

    const mediaUrls = findAllMedia(post);
    if (mediaUrls.length === 0) {
      console.log(` -> No new media found for post ${postId}.`);
      processedPosts[community].push(postId);
      saveProcessedPosts(processedPosts);
      continue;
    }

    const downloadedFiles = [];

    for (const url of mediaUrls) {
      try {
        const urlObj = new URL(url);
        const originalName = path.basename(urlObj.pathname);
        const fileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        const filePath = path.join(downloadDir, fileName);

        console.log(` -> Downloading: ${url}`);
        await downloadToFile(url, filePath, buildScoredHeaders());
        downloadedFiles.push({ originalPath: filePath, fileName });
      } catch (err) {
        console.error(` -> Failed to download: ${url}`, err.message || err);
      }
    }

    const filesToUpload = [];
    for (const file of downloadedFiles) {
      const isVideo = file.originalPath.endsWith(".mp4");
      if (isVideo) {
        const watermarkedPath = path.join(downloadDir, `watermarked_${file.fileName}`);
        try {
          const processedFile = await addWatermarkToVideo(file.originalPath, watermarkedPath, WATERMARK_PATH);
          filesToUpload.push(processedFile);
          await fse.remove(file.originalPath);
        } catch {
          filesToUpload.push(file.originalPath);
        }
      } else {
        filesToUpload.push(file.originalPath);
      }
    }

    if (filesToUpload.length > 0) {
      try {
        console.log(` -> Uploading ${filesToUpload.length} file(s) to FileDitch...`);
        const uploadRes = await uploadFilesToFileDitch(filesToUpload);
        const mirrorUrl = extractMirrorUrl(uploadRes);

        if (mirrorUrl) {
          const commentContent = `MIRROR: ${mirrorUrl}`;
          console.log(` -> Posting comment: ${commentContent}`);
          await postComment(commentContent, postId, community);
          console.log(` -> Successfully posted mirror for post ${postId}!`);
        }

        await enforceMaxFiles(downloadDir, 2, 5);

      } catch (err) {
        console.error(` -> Failed to upload or comment for post ${postId}`, err.response?.data || err.message || err);
      }
    }

    processedPosts[community].push(postId);
    saveProcessedPosts(processedPosts);
  }
}

// ----------------- MAIN LOOP -----------------
async function main() {
  let processedPosts = loadProcessedPosts();
  const headers = buildScoredHeaders();

  console.log("Starting backup bot...");

  const runBackup = async () => {
    console.log(`\n[${new Date().toISOString()}] Fetching new posts...`);

    for (const COMMUNITY of communityList) {
      const SCORED_FETCH_URL = `https://api.scored.co/api/v2/post/newv2.json?community=${COMMUNITY}`;
      try {
        const feed = await fetchJson(SCORED_FETCH_URL, headers);
        const posts = Array.isArray(feed) ? feed : feed.posts || [];

        if (posts.length > 0) {
          posts.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
          await processPosts(posts, processedPosts, COMMUNITY);
          console.log(`Finished processing batch for community: ${COMMUNITY}`);
        } else {
          console.log(`No posts found in the feed for community: ${COMMUNITY}`);
        }
      } catch (err) {
        console.error(`Error fetching/processing posts for community ${COMMUNITY}:`, err.response?.data || err.message || err);
      }
    }
  };

  await runBackup();
  console.log(`Entering polling mode. Will check for new posts every ${POLL_INTERVAL / 1000 / 60} minutes.`);
  setInterval(runBackup, POLL_INTERVAL);
}

main();
