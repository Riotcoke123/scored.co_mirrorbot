
<div id="top">
  
  <h1 align="center">Scored.co Mirror Bot 🤖</h1>
  
  <p align="center">
    A Node.js bot to automatically mirror media content from new Scored.co posts to a file-hosting service (FileDitch) and post the mirror link as a comment.
    <br />
    <a href="https://github.com/Riotcoke123/scored.co_mirrorbot"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/Riotcoke123/scored.co_mirrorbot/issues">Report Bug</a>
    ·
    <a href="https://github.com/Riotcoke123/scored.co_mirrorbot/issues">Request Feature</a>
  </p>
  
  <p align="center">
    <img src="https://github.com/user-attachments/assets/3bae1e58-3381-4e42-805d-f64a6d198ddc" alt="Project Logo" width="100"/>
  </p>
</div>

<hr/>

<h2 id="table-of-contents">Table of Contents</h2>
<ul>
  <li><a href="#about-the-project">About The Project</a></li>
  <li><a href="#features">Features</a></li>
  <li><a href="#getting-started">Getting Started</a>
    <ul>
      <li><a href="#prerequisites">Prerequisites</a></li>
      <li><a href="#installation">Installation</a></li>
    </ul>
  </li>
  <li><a href="#configuration-environment-variables">Configuration (Environment Variables)</a></li>
  <li><a href="#file-and-directory-structure">File and Directory Structure</a></li>
  <li><a href="#license">License</a></li>
</ul>

<hr/>

<h2 id="about-the-project">About The Project</h2>

<p>This project is a dedicated **Scored.co Mirror Bot** built with Node.js. It continuously monitors specified Scored.co communities for new posts that contain media (videos or images). The primary goal is to create permanent backups (mirrors) of this media and share the mirror link directly on the original post.</p>

<p>It leverages the Scored.co API for fetching posts and commenting, and uses FileDitch for secure media hosting.</p>

<hr/>

<h2 id="features">Features</h2>
<ul>
  <li>🔄 **Automatic Polling:** Periodically checks for new posts in configured communities.</li>
  <li>🖼️ **Media Detection:** Automatically finds and downloads media (<code>.mp4</code>, <code>.jpg</code>, <code>.png</code>, <code>.gif</code>, <code>.webp</code>) from various post types (link, media, gallery).</li>
  <li>🚫 **Domain Filtering:** Skips media from known, often volatile, external platforms (e.g., YouTube, TikTok, Twitter, Twitch).</li>
  <li>🎬 **Video Watermarking:** Uses <code>ffmpeg</code> to apply a configurable watermark (<code>logo.png</code>) to all downloaded videos before upload.</li>
  <li>☁️ **Cloud Mirroring:** Uploads downloaded and processed media to **FileDitch**.</li>
  <li>💬 **Automated Commenting:** Posts the generated FileDitch mirror URL as a comment on the original Scored.co post.</li>
  <li>🗂️ **Post History:** Tracks processed posts in <code>processed_posts.json</code> to prevent double-posting.</li>
  <li>🗑️ **File Cleanup:** Enforces a limit on the number of local files in the <code>/downloads</code> directory (e.g., max 2 videos, max 5 images) to manage disk space.</li>
</ul>

<hr/>

<h2 id="getting-started">Getting Started</h2>

<h3 id="prerequisites">Prerequisites</h3>
<p>You need the following installed on your system:</p>
<ul>
  <li><a href="https://nodejs.org/">Node.js</a> (v14+)</li>
  <li><a href="https://ffmpeg.org/">FFmpeg</a> (Required for video watermarking)</li>
</ul>

<h3 id="installation">Installation</h3>
<ol>
  <li>Clone the repository:
    <pre><code>git clone https://github.com/Riotcoke123/scored.co_mirrorbot.git
cd scored.co_mirrorbot</code></pre>
  </li>
  <li>Install Node.js dependencies:
    <pre><code>npm install</code></pre>
  </li>
  <li>Create a <code>.env</code> file in the root directory and configure your credentials (see <a href="#configuration-environment-variables">Configuration</a>).</li>
  <li>Add your watermark image named <code>logo.png</code> to the root directory.</li>
  <li>Run the bot:
    <pre><code>node index.js</code></pre>
  </li>
</ol>

<hr/>

<h2 id="configuration-environment-variables">Configuration (Environment Variables)</h2>

<p>Create a <code>.env</code> file in the project root. The following variables are **required** for the bot to function:</p>

| Variable | Description | Example |
| :--- | :--- | :--- |
| `X_API_KEY` | Your Scored.co API Key. | `your_api_key_123` |
| `X_API_PLATFORM` | Scored.co API Platform header value. | `scored.co` |
| `X_API_SECRET` | Your Scored.co API Secret. | `your_api_secret_456` |
| `X_XSRF_TOKEN` | Your Scored.co XSRF Token. | `your_xsrf_token_789` |
| `REFERER` | HTTP Referer header to simulate a web request. | `https://scored.co/` |
| `USER_AGENT` | HTTP User-Agent header string. | `Mozilla/5.0...` |

<p>The following variables are **optional** and have default values:</p>

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `COMMUNITIES` | Comma-separated list of communities to monitor. | `SpicTank` |
| `COMMENT_PARENT_ID` | The <code>commentParentId</code> to use when posting (usually <code>0</code>). | `0` |
| `POLL_INTERVAL` | Time in milliseconds between checks for new posts. | `300000` (5 minutes) |
| `MAX_CONCURRENT_DOWNLOADS` | Max number of files to download at once (unused in current sync implementation, but good to keep). | `5` |

<hr/>

<h2 id="file-and-directory-structure">File and Directory Structure</h2>

<pre>
/
├── index.js              <-- The main bot script
├── .env                  <-- Environment variables (sensitive data)
├── logo.png              <-- The image file used for video watermarking
├── package.json          <-- Node.js dependencies
├── processed_posts.json  <-- Stores IDs of posts already processed
└── /downloads/           <-- Temporary directory for downloaded media (managed by bot)
</pre>

<hr/>

<h2 id="license">License</h2>

<p>Distributed under the **GNU General Public License v3.0**. See the <a href="https://www.gnu.org/licenses/gpl-3.0.en.html">GNU GPLv3</a> for more information.</p>







2 / 2

