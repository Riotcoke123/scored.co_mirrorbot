const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const fse = require("fs-extra");
const dotenv = require("dotenv");

// ----------------- CONFIGURATION -----------------
dotenv.config();

const {
  X_API_KEY,
  X_API_PLATFORM,
  X_API_SECRET,
  X_XSRF_TOKEN,
  REFERER,
  USER_AGENT,
  COMMUNITY = "IP2Always",
  COMMENT_PARENT_ID = "0",
  POLL_INTERVAL = 300000 // 5 minutes
} = process.env;

// Validate essential environment variables
const requiredEnv = ['X_API_KEY', 'X_API_PLATFORM', 'X_API_SECRET', 'X_XSRF_TOKEN'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Error: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const FILEDITCH_UPLOAD_URL = "https://up1.fileditch.com/upload.php";
const SCORED_COMMENT_URL = "https://api.scored.co/api/v2/action/create_comment";
const SCORED_FETCH_URL = `https://api.scored.co/api/v2/post/newv2.json?community=${COMMUNITY}`;
const PROCESSED_FILE = path.join(__dirname, "processed_posts.json");

// List of domains to skip for media downloading
const SKIPPED_DOMAINS = ["parti.com", "kick.com", "youtube.com"];
// This line already includes .mp4 files for processing
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

/**
 * Intelligently finds all media URLs in a post object.
 * Prioritizes known high-quality media locations to avoid thumbnails.
 * This fixes the issue of re-uploaded images being smaller.
 */
function findAllMedia(post) {
    const urls = new Set();

    // 1. Prioritize specific, known media fields for highest quality
    if (post?.media?.url) urls.add(post.media.url);
    if (post?.url) urls.add(post.url);

    // 2. Check for galleries
    if (Array.isArray(post.gallery)) {
        post.gallery.forEach(item => {
            if (item?.url) urls.add(item.url);
        });
    }

    // 3. Generic fallback: search the entire post object for URLs (less reliable)
    if (urls.size === 0) {
        function walk(x) {
            if (!x) return;
            if (typeof x === "string" && x.startsWith("http")) urls.add(x);
            else if (Array.isArray(x)) x.forEach(walk);
            else if (typeof x === "object") Object.values(x).forEach(walk);
        }
        walk(post);
    }
    
    // Filter for valid media URLs from non-skipped domains
    return Array.from(urls).filter((u) => {
        if (!MEDIA_REGEX.test(u)) return false;
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
  filePaths.forEach(fp => {
    form.append("files[]", fs.createReadStream(fp));
  });
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

async function postComment(content, parentId) {
  const headers = buildScoredHeaders();
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  const params = new URLSearchParams({
    content,
    parentId: String(parentId),
    commentParentId: String(COMMENT_PARENT_ID),
    community: COMMUNITY,
  });

  const res = await axios.post(SCORED_COMMENT_URL, params.toString(), { headers });
  return res.data;
}

function loadProcessedPosts() {
  if (fs.existsSync(PROCESSED_FILE)) {
    try {
      return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8")));
    } catch (e) {
      console.error("Error reading processed posts file. Starting fresh.", e);
      return new Set();
    }
  }
  return new Set();
}

function saveProcessedPosts(set) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(Array.from(set), null, 2), "utf8");
}

// ----------------- PROCESS POSTS -----------------
async function processPosts(posts, processedPosts) {
  const downloadDir = path.join(__dirname, "downloads");
  ensureDir(downloadDir);

  for (const post of posts) {
    const postId = post.id;
    if (processedPosts.has(postId)) continue;

    console.log(`\nProcessing post: ${postId}`);
    const mediaUrls = findAllMedia(post);

    if (mediaUrls.length === 0) {
      console.log(` -> No new media found for post ${postId}.`);
      processedPosts.add(postId);
      saveProcessedPosts(processedPosts);
      continue;
    }

    const filePaths = [];
    for (const url of mediaUrls) {
      try {
        const urlObj = new URL(url);
        const originalName = path.basename(urlObj.pathname);
        const fileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '')}`;
        const filePath = path.join(downloadDir, fileName);

        console.log(` -> Downloading: ${url}`);
        await downloadToFile(url, filePath, buildScoredHeaders());
        filePaths.push(filePath);
      } catch (err) {
        console.error(` -> Failed to download: ${url}`, err.message || err);
      }
    }

    if (filePaths.length > 0) {
      try {
        console.log(` -> Uploading ${filePaths.length} file(s) to FileDitch...`);
        const uploadRes = await uploadFilesToFileDitch(filePaths);
        const mirrorUrl = extractMirrorUrl(uploadRes);

        if (mirrorUrl) {
          const commentContent = `MIRROR: ${mirrorUrl}`;
          console.log(` -> Posting comment: ${commentContent}`);
          await postComment(commentContent, postId);
          console.log(` -> Successfully posted mirror for post ${postId}!`);
        }
      } catch (err) {
        console.error(` -> Failed to upload or comment for post ${postId}`, err.response?.data || err.message || err);
      } finally {
        // Clean up downloaded files
        filePaths.forEach(fp => fse.remove(fp).catch(e => console.error(`Failed to delete file: ${fp}`, e)));
      }
    }

    processedPosts.add(postId);
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
    try {
      const feed = await fetchJson(SCORED_FETCH_URL, headers);
      const posts = Array.isArray(feed) ? feed : feed.posts || [];
      if (posts.length > 0) {
        // Sort from oldest to newest to process in chronological order
        posts.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        await processPosts(posts, processedPosts);
        console.log("Finished processing batch.");
      } else {
        console.log("No posts found in the feed.");
      }
    } catch (err) {
      console.error("Error during fetch/process cycle:", err.response?.data || err.message || err);
    }
  };

  // Run once immediately on start
  await runBackup();

  // Then run on a polling interval
  console.log(`Entering polling mode. Will check for new posts every ${POLL_INTERVAL / 1000 / 60} minutes.`);
  setInterval(runBackup, POLL_INTERVAL);
}

main();