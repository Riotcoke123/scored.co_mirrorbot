<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scored.co Mirror Bot</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f6f8fa; padding: 20px; color: #24292f; }
    h1, h2 { color: #0366d6; }
    h1 { font-size: 2em; margin-bottom: 0.2em; }
    h2 { margin-top: 1.5em; border-bottom: 2px solid #0366d6; padding-bottom: 0.2em; }
    p { margin: 0.5em 0; }
    code { background: #f6f8fa; border: 1px solid #d1d5da; border-radius: 6px; padding: 2px 6px; font-family: monospace; }
    pre { background: #f6f8fa; border: 1px solid #d1d5da; border-radius: 6px; padding: 15px; overflow-x: auto; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { margin-bottom: 20px; padding-left: 20px; }
    section { background: #fff; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .badge { display: inline-block; padding: 2px 8px; font-size: 0.85em; font-weight: bold; border-radius: 12px; margin-right: 5px; color: #fff; }
    .badge-license { background: #6f42c1; }
    .badge-node { background: #43853d; }
    .badge-npm { background: #cb3837; }
    .icon { margin-right: 8px; color: #0366d6; }
  </style>
</head>
<body>
  <h1><i class="fas fa-camera icon"></i>Scored.co Mirror Bot</h1>

  <p>
    <span class="badge badge-license">GPLv3</span>
    <span class="badge badge-node">Node.js</span>
    <span class="badge badge-npm">npm</span>
  </p>

  <p>A Node.js bot that automatically mirrors media posts from <a href="https://scored.co" target="_blank">Scored.co</a> communities to <a href="https://fileditch.com" target="_blank">FileDitch</a> and posts the mirror link as a comment.</p>

  <section>
    <h2><i class="fas fa-star icon"></i>Features</h2>
    <ul>
      <li>Automatically fetches new posts from specified Scored.co communities.</li>
      <li>Filters media URLs (images/videos) and skips specific domains.</li>
      <li>Downloads media files locally with concurrency control.</li>
      <li>Uploads media to FileDitch.</li>
      <li>Posts the mirror link as a comment on the original post.</li>
      <li>Keeps track of already processed posts to avoid duplicates.</li>
      <li>Runs continuously with configurable polling intervals.</li>
    </ul>
  </section>

  <section>
    <h2><i class="fas fa-cogs icon"></i>Requirements</h2>
    <ul>
      <li>Node.js v18+</li>
      <li>npm packages: <code>axios</code>, <code>form-data</code>, <code>fs-extra</code>, <code>dotenv</code></li>
      <li>Scored.co API credentials</li>
    </ul>
  </section>

  <section>
    <h2><i class="fas fa-download icon"></i>Installation</h2>
    <pre><code>git clone https://github.com/Riotcoke123/scored.co_mirrorbot.git
cd scored.co_mirrorbot
npm install</code></pre>
  </section>

  <section>
    <h2><i class="fas fa-wrench icon"></i>Configuration</h2>
    <p>Create a <code>.env</code> file in the root directory with the following variables:</p>
    <pre><code>X_API_KEY=your_api_key
X_API_PLATFORM=your_api_platform
X_API_SECRET=your_api_secret
X_XSRF_TOKEN=your_xsrf_token
REFERER=https://scored.co
USER_AGENT=YourUserAgentHere
COMMUNITIES=IP2Always,SpicTank
COMMENT_PARENT_ID=0
POLL_INTERVAL=300000
MAX_CONCURRENT_DOWNLOADS=5</code></pre>
    <ul>
      <li><code>COMMUNITIES</code> – Comma-separated list of communities to monitor.</li>
      <li><code>POLL_INTERVAL</code> – Check interval for new posts (ms).</li>
      <li><code>MAX_CONCURRENT_DOWNLOADS</code> – Number of media files to download simultaneously.</li>
    </ul>
  </section>

  <section>
    <h2><i class="fas fa-play icon"></i>Usage</h2>
    <pre><code>node index.js</code></pre>
    <p>The bot will fetch posts, mirror media, post comments, and enter a polling loop at the configured interval.</p>
  </section>

  <section>
    <h2><i class="fas fa-folder icon"></i>File Structure</h2>
    <ul>
      <li><code>index.js</code> – Main bot script</li>
      <li><code>processed_posts.json</code> – Tracks processed posts</li>
      <li><code>/downloads</code> – Temporary folder for downloaded media files</li>
      <li><code>.env</code> – Configuration file</li>
    </ul>
  </section>

  <section>
    <h2><i class="fas fa-balance-scale icon"></i>License</h2>
    <p>This project is licensed under the <strong>GNU General Public License v3.0 (GPLv3)</strong>. See the full license at <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank">https://www.gnu.org/licenses/gpl-3.0.en.html</a>.</p>
  </section>

  <section>
    <h2><i class="fas fa-exclamation-triangle icon"></i>Disclaimer</h2>
    <p>This bot is intended for personal backup use only. Respect the terms of service of Scored.co and FileDitch when using this software.</p>
  </section>
</body>
</html>
