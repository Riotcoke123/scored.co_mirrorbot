const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const fse = require("fs-extra");
const dotenv = require("dotenv");

dotenv.config();

const {
  X_API_KEY,
  X_API_PLATFORM,
  X_API_SECRET,
  X_XSRF_TOKEN,
  REFERER,
  USER_AGENT,
  COMMUNITY = "spictank",
  COMMENT_PARENT_ID = "0",
  SCORED_FETCH_URL = "https://api.scored.co/api/v2/post/newv2.json?community=spictank",
  POLL_INTERVAL = 300000 // 5 minutes
} = process.env;

const FILEDITCH_UPLOAD_URL = "https://up1.fileditch.com/upload.php";
const SCORED_COMMENT_URL = "https://api.scored.co/api/v2/action/create_comment";
const PROCESSED_FILE = path.join(__dirname, "processed_posts.json");

// List of domains to skip for media downloading
const SKIPPED_DOMAINS = ["parti.com", "kick.com", "youtube.com"];

// ----------------- HELPERS -----------------
function buildScoredHeaders() {
  const headers = {};
  if (X_API_KEY) headers["x-api-key"] = X_API_KEY;
  if (X_API_PLATFORM) headers["x-api-platform"] = X_API_PLATFORM;
  if (X_API_SECRET) headers["x-api-secret"] = X_API_SECRET;
  if (X_XSRF_TOKEN) headers["x-xsrf-token"] = X_XSRF_TOKEN;
  if (REFERER) headers["referer"] = REFERER;
  if (USER_AGENT) headers["user-agent"] = USER_AGENT;

  headers["sec-ch-ua"] =
    '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"';
  headers["sec-ch-ua-mobile"] = "?0";
  headers["sec-ch-ua-platform"] = '"Windows"';
  headers["sec-fetch-dest"] = "empty";
  headers["sec-fetch-mode"] = "cors";
  headers["sec-fetch-site"] = "same-origin";

  return headers;
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
    writer.on("error", (err) => { error = err; writer.close(); reject(err); });
    writer.on("close", () => { if (!error) resolve(destPath); });
  });
}

// Extract all media URLs, skipping specified domains
function findAllMedia(post) {
  const urls = [];
  function walk(x) {
    if (!x) return;
    if (typeof x === "string" && x.startsWith("http")) urls.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (typeof x === "object") Object.values(x).forEach(walk);
  }
  walk(post);

  return urls.filter((u) => {
    // Check if the URL is a media file and not from a skipped domain
    const isMedia = u.match(/\.mp4($|\?)|\.jpe?g($|\?)|\.png($|\?)|\.gif($|\?)|\.webp($|\?)/i);
    if (!isMedia) return false;

    try {
      const urlHost = new URL(u).hostname.replace(/^www\./, '');
      return !SKIPPED_DOMAINS.some(domain => urlHost.endsWith(domain));
    } catch (e) {
      console.error("Invalid URL:", u);
      return false;
    }
  });
}

async function uploadFilesToFileDitch(filePaths) {
  const form = new FormData();
  for (const fp of filePaths) {
    form.append("files[]", fs.createReadStream(fp));
  }
  const res = await axios.post(FILEDITCH_UPLOAD_URL, form, {
    headers: form.getHeaders(),
    timeout: 120000,
  });
  return res.data;
}

function extractMirrorUrl(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data[0]?.url || null;
  if (data.url) return data.url;
  if (data.files?.[0]?.url) return data.files[0].url;
  if (data.file?.url) return data.file.url;
  return null;
}

async function postComment(content, parentId, commentParentId, community) {
  const headers = buildScoredHeaders();
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  const params = new URLSearchParams();
  params.append("content", content);
  params.append("parentId", String(parentId));
  params.append("commentParentId", String(commentParentId));
  params.append("community", community);

  const res = await axios.post(SCORED_COMMENT_URL, params.toString(), { headers });
  return res.data;
}

function loadProcessedPosts() {
  if (fs.existsSync(PROCESSED_FILE)) {
    return JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
  }
  return [];
}

function saveProcessedPosts(list) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(list, null, 2), "utf8");
}

// ----------------- PROCESS POSTS -----------------
async function processPosts(posts, processedPosts) {
  ensureDir("./downloads");

  for (const post of posts) {
    const postId = post.id;
    if (processedPosts.includes(postId)) continue;

    const mediaUrls = findAllMedia(post);
    if (mediaUrls.length === 0) {
      console.log("No media found for post:", postId);
      processedPosts.push(postId);
      saveProcessedPosts(processedPosts);
      continue;
    }

    // Download all media first
    const filePaths = [];
    for (const url of mediaUrls) {
      try {
        const ext = path.extname(new URL(url).pathname).split("?")[0] || ".dat";
        const type = url.match(/\.mp4($|\?)/i) ? "video" : "image";
        const fileName = `${type}_${Date.now()}${ext}`;
        const filePath = path.join("./downloads", fileName);

        console.log(`Downloading ${type}:`, url);
        await downloadToFile(url, filePath, buildScoredHeaders());
        filePaths.push(filePath);
      } catch (err) {
        console.error("Failed to download:", url, err.message || err);
      }
    }

    // Upload all files together to FileDitch
    if (filePaths.length > 0) {
      console.log("Uploading files to FileDitch for post:", postId);
      const uploadRes = await uploadFilesToFileDitch(filePaths);
      const mirrorUrl = extractMirrorUrl(uploadRes);

      if (mirrorUrl) {
        const commentContent = `MIRROR: ${mirrorUrl}`;
        console.log("Posting comment:", commentContent);
        await postComment(commentContent, postId, COMMENT_PARENT_ID, COMMUNITY);
        console.log(`Posted mirror for post ${postId}`);
      }
    }

    processedPosts.push(postId);
    saveProcessedPosts(processedPosts);
  }
}

// ----------------- MAIN LOOP -----------------
async function backupBot() {
  let processedPosts = loadProcessedPosts();
  const headers = buildScoredHeaders();

  console.log("Starting catch-up backup...");

  try {
    const feed = await fetchJson(SCORED_FETCH_URL, headers);
    const posts = Array.isArray(feed) ? feed : feed.posts || [];
    if (posts.length > 0) {
      posts.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      await processPosts(posts, processedPosts);
    } else {
      console.log("No posts to catch up on.");
    }
  } catch (err) {
    console.error("Error during initial catch-up:", err.response?.data || err.message || err);
  }

  console.log("Initial catch-up complete. Entering polling...");

  setInterval(async () => {
    try {
      const feed = await fetchJson(SCORED_FETCH_URL, headers);
      const posts = Array.isArray(feed) ? feed : feed.posts || [];
      if (posts.length > 0) {
        posts.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        await processPosts(posts, processedPosts);
      }
    } catch (err) {
      console.error("Error during polling:", err.response?.data || err.message || err);
    }
  }, POLL_INTERVAL);
}

backupBot();