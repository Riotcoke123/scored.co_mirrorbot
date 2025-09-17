<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

</head>
<body>
  <div class="header">
    <h1>📸 Scored.co Mirror Bot</h1>
    <p>A Node.js script to back up media from Scored.co posts to Fileditch.com.</p>
  </div>

  <div class="section">
    <h2>✨ Features</h2>
    <ul>
      <li>Automatically fetches new posts from a specified Scored.co community.</li>
      <li>Downloads media (images and videos) from the fetched posts.</li>
      <li>Skips specified domains (e.g., YouTube, Kick).</li>
      <li>Uploads downloaded media to Fileditch.com for mirroring.</li>
      <li>Posts a comment on the original Scored.co post with the mirror URL.</li>
      <li>Maintains a list of processed posts to avoid re-downloading.</li>
      <li>Runs continuously with a configurable polling interval.</li>
    </ul>
  </div>

  <div class="section">
    <h2>🛠️ Setup</h2>
    <p>1. <strong>Clone the repository:</strong></p>
    <pre><code>git clone https://github.com/Riotcoke123/scored.co_mirrorbot</code></pre>
    <p>2. <strong>Install dependencies:</strong></p>
    <pre><code>npm install axios dotenv form-data fs-extra</code></pre>
    <p>3. <strong>Configure environment variables:</strong></p>
    <p>
      Create a <code>.env</code> file in the project root and add the required API keys
      and configuration settings. You can obtain these from a logged-in session on
      Scored.co's website (look for requests to <code>api.scored.co</code> in your browser's developer tools).
    </p>
    <pre><code>X_API_KEY="your-api-key"
X_API_PLATFORM="your-api-platform"
X_API_SECRET="your-api-secret"
X_XSRF_TOKEN="your-xsrf-token"
REFERER="https://scored.co/"
USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
COMMUNITY="spictank" # Change to your desired community
SCORED_FETCH_URL="https://api.scored.co/api/v2/post/newv2.json?community=spictank" # Adjust if necessary
POLL_INTERVAL=300000 # 5 minutes (in milliseconds)</code></pre>
  </div>

  <div class="section">
    <h2>🚀 Usage</h2>
    <p>To start the bot, run the following command in your terminal:</p>
    <pre><code>node index.js</code></pre>
    <p>
      The bot will perform an initial catch-up, processing all existing posts, and
      then enter a continuous polling loop to process new posts as they are created.
    </p>
  </div>

  <div class="section">
    <h2>🔗 Links</h2>
    <ul>
      <li><strong>Website:</strong> <a href="https://scored.co/">https://scored.co/</a></li>
      <li><strong>API Documentation:</strong> <a href="https://docs.scored.co/">https://docs.scored.co/</a></li>
    </ul>
  </div>

  <div class="section">
    <h2>⚙️ Configuration</h2>
    <p>You can customize the bot's behavior by modifying the <code>.env</code> file:</p>
    <ul>
      <li><code>COMMUNITY</code>: The Scored.co community to monitor.</li>
      <li><code>SCORED_FETCH_URL</code>: The API endpoint for fetching posts.</li>
      <li><code>POLL_INTERVAL</code>: The time in milliseconds between each check for new posts.</li>
      <li><code>SKIPPED_DOMAINS</code>: An array of domains to ignore when downloading media (hardcoded in the script).</li>
    </ul>
  </div>

  <footer class="section">
    <p><em>Future updates will come as bugs show up.</em></p>
  </footer>
</body>
</html>
