const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const fse = require("fs-extra");
const dotenv = require("dotenv");

dotenv.config();

// ----------------- CONFIGURATION -----------------
const {
  X_API_KEY,
  X_API_PLATFORM,
  X_API_SECRET,
  X_XSRF_TOKEN,
  REFERER,
  USER_AGENT,
  COMMUNITIES = "IP2Always,SpicTank",
  COMMENT_PARENT_ID = "0",
  POLL_INTERVAL = 300000, // 5 minutes
  MAX_CONCURRENT_DOWNLOADS = 5 // Limit parallel downloads to avoid overload
} = process.env;

const communityList = COMMUNITIES.split(",").map(c => c.trim());

const requiredEnv = ['X_API_KEY', 'X_API_PLATFORM', 'X_API_SECRET', 'X_XSRF_TOKEN'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Error: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const FILEDITCH_UPLOAD_URL = "https://up1.fileditch.com/upload.php";
const SCORED_COMMENT_URL = "https://api.scored.co/api/v2/action/create_comment";
const PROCESSED_FILE = path.join(__dirname, "processed_posts.json");

const SKIPPED_DOMAINS = ["parti.com", "kick.com", "youtube.com", "tiktok.com", "youtu.be", "twitter.com", "rumble.com", "twitch.tv", "dlive.tv", "instagram.com"];
const MEDIA_REGEX = /\.(mp4|jpe?g|png|gif|webp)($|\?)/i;

// ----------------- HELPERS -----------------
function buildScoredHeaders() {
  return {
    "x-api-key": X_API_KEY,
    "x-api-platform": X_API_PLATFORM,
    "x-api-secret": X_API_SECRET,
    "x-xsrf-token": X_XSRF_TOKEN,
    "referer": REFERER,
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
    writer.on("error", (err) => { error = err; writer.close(); reject(err); });
    writer.on("close", () => { if (!error) resolve(destPath); });
  });
}

function findAllMedia(post) {
  const urls = new Set();
  if (post?.link) urls.add(post.link);
  if (post?.media?.url) urls.add(post.media.url);
  if (post?.url) urls.add(post.url);
  if (Array.isArray(post.gallery)) post.gallery.forEach(item => { if (item?.url) urls.add(item.url); });

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
      const urlHost = urlObj.hostname.replace(/^www\./, '');
      return !SKIPPED_DOMAINS.some(domain => urlHost.endsWith(domain));
    } catch (e) {
      console.error("Invalid URL:", u);
      return false;
    }
  });
}

async function uploadFilesToFileDitch(filePaths) {
  const form = new FormData();
  filePaths.forEach(fp => form.append("files[]", fs.createReadStream(fp)));
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

// ----------------- PROCESSED POSTS -----------------
function loadProcessedPosts() {
  if (fs.existsSync(PROCESSED_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
    } catch (e) {
      console.error("Error reading processed posts file. Starting fresh.", e);
      return {};
    }
  }
  return {};
}

function saveProcessedPosts(obj) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(obj, null, 2), "utf8");
}

// ----------------- PROCESS POSTS -----------------
async function processPosts(posts, processedPosts, community) {
  const downloadDir = path.join(__dirname, "downloads");
  ensureDir(downloadDir);

  if (!processedPosts[community]) processedPosts[community] = [];

  for (const post of posts) {
    const postId = post.id;
    if (processedPosts[community].includes(postId)) continue;

    console.log(`\nProcessing post: ${postId} (Community: ${community})`);
    const mediaUrls = findAllMedia(post);

    if (mediaUrls.length === 0) {
      console.log(` -> No new media found for post ${postId}.`);
      processedPosts[community].push(postId);
      saveProcessedPosts(processedPosts);
      continue;
    }

    const filePaths = [];

    // Parallelized downloads with concurrency limit
    const downloadQueue = [...mediaUrls];
    while (downloadQueue.length > 0) {
      const batch = downloadQueue.splice(0, MAX_CONCURRENT_DOWNLOADS);
      const results = await Promise.all(batch.map(async (url) => {
        try {
          const urlObj = new URL(url);
          const originalName = path.basename(urlObj.pathname);
          const fileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '')}`;
          const filePath = path.join(downloadDir, fileName);
          console.log(` -> Downloading: ${url}`);
          await downloadToFile(url, filePath, buildScoredHeaders());
          return filePath;
        } catch (err) {
          console.error(` -> Failed to download: ${url}`, err.message || err);
          return null;
        }
      }));

      results.forEach(fp => { if (fp) filePaths.push(fp); });
    }

    if (filePaths.length > 0) {
      try {
        console.log(` -> Uploading ${filePaths.length} file(s) to FileDitch...`);
        const uploadRes = await uploadFilesToFileDitch(filePaths);
        const mirrorUrl = extractMirrorUrl(uploadRes);

        if (mirrorUrl) {
          const commentContent = `MIRROR: ${mirrorUrl}`;
          console.log(` -> Posting comment: ${commentContent}`);
          await postComment(commentContent, postId, community);
          console.log(` -> Successfully posted mirror for post ${postId}!`);
        }
      } catch (err) {
        console.error(` -> Failed to upload or comment for post ${postId}`, err.response?.data || err.message || err);
      } finally {
        filePaths.forEach(fp => fse.remove(fp).catch(e => console.error(`Failed to delete file: ${fp}`, e)));
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