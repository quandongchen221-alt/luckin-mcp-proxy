const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LUCKIN_TOKEN;
const TARGET_HOST = 'gwmcp.lkcoffee.com';
const TARGET_PATH = '/order/user/mcp';

app.use('/', (req, res) => {
  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: TARGET_PATH,
    method: req.method,
    headers: {
      ...req.headers,
      'Authorization': `Bearer ${TOKEN}`,
      'host': TARGET_HOST,
    }
  };

  const proxy = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  req.pipe(proxy, { end: true });

  proxy.on('error', (err) => {
    console.error('错误:', err);
    res.status(500).end();
  });
});

app.listen(PORT, () => {
  console.log(`瑞幸代理启动，端口 ${PORT}`);
});
