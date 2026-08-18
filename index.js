const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LUCKIN_TOKEN;
const TARGET_HOST = 'gwmcp.lkcoffee.com';
const TARGET_PATH = '/order/user/mcp';

const TOOL_METADATA = {
  queryShopList: {
    title: '查询瑞幸门店',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  searchProductForMcp: {
    title: '搜索瑞幸商品',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  switchProduct: {
    title: '切换商品规格',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  queryProductDetailInfo: {
    title: '查询商品详情',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  previewOrder: {
    title: '预览订单',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  createOrder: {
    title: '创建瑞幸订单',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  queryOrderDetailInfo: {
    title: '查询订单详情',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  cancelOrder: {
    title: '取消瑞幸订单',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
};

function addChatGptToolMetadata(payload) {
  if (!payload || !payload.result || !Array.isArray(payload.result.tools)) return payload;

  payload.result.tools = payload.result.tools.map((tool) => {
    const metadata = TOOL_METADATA[tool.name];
    return metadata ? { ...tool, ...metadata } : tool;
  });
  return payload;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => {
  if (!TOKEN) {
    console.error('LUCKIN_TOKEN is not configured');
    return res.status(503).json({ error: 'Server is not configured' });
  }

  // The Luckin endpoint is Streamable HTTP over POST. A GET request is the
  // optional SSE listening channel in the MCP spec; returning 405 tells MCP
  // clients that this server does not expose that optional channel.
  if (req.method === 'GET') {
    res.set('Allow', 'POST, OPTIONS');
    return res.status(405).end();
  }

  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id',
    });
    return res.status(204).end();
  }

  const requestChunks = [];
  req.on('data', (chunk) => requestChunks.push(chunk));
  req.on('end', () => {
    const requestBody = Buffer.concat(requestChunks);
    let rpcMethod = 'unknown';

    try {
      rpcMethod = JSON.parse(requestBody.toString('utf8')).method || 'unknown';
    } catch {
      // GET requests and malformed payloads are forwarded unchanged.
    }

    console.log(`${req.method} ${req.path} MCP method=${rpcMethod}`);

    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers['content-length'];
    delete headers.authorization;
    delete headers.origin;
    delete headers.referer;
    // Luckin requires both response modes to be advertised. Some MCP clients
    // probe with only text/event-stream, which Luckin rejects with 405.
    headers.accept = 'application/json, text/event-stream';
    headers.authorization = `Bearer ${TOKEN}`;
    headers.host = TARGET_HOST;
    if (requestBody.length > 0) headers['content-length'] = requestBody.length;

    const proxy = https.request(
      {
        hostname: TARGET_HOST,
        port: 443,
        path: TARGET_PATH,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const responseChunks = [];
        proxyRes.on('data', (chunk) => responseChunks.push(chunk));
        proxyRes.on('end', () => {
          let responseBody = Buffer.concat(responseChunks);
          const responseHeaders = { ...proxyRes.headers };
          delete responseHeaders.connection;
          delete responseHeaders['transfer-encoding'];
          delete responseHeaders['content-length'];

          if (rpcMethod === 'tools/list') {
            try {
              const payload = addChatGptToolMetadata(JSON.parse(responseBody.toString('utf8')));
              responseBody = Buffer.from(JSON.stringify(payload));
              responseHeaders['content-type'] = 'application/json; charset=utf-8';
            } catch (error) {
              console.error('Could not annotate tools/list response:', error.message);
            }
          }

          responseHeaders['content-length'] = responseBody.length;
          res.writeHead(proxyRes.statusCode || 502, responseHeaders);
          res.end(responseBody);
        });
      }
    );

    proxy.setTimeout(30000, () => {
      proxy.destroy(new Error('Upstream request timed out'));
    });

    proxy.on('error', (error) => {
      console.error(`Upstream error for ${rpcMethod}:`, error.message);
      if (!res.headersSent) res.status(502).json({ error: 'Upstream MCP request failed' });
    });

    proxy.end(requestBody);
  });
});

app.listen(PORT, () => {
  console.log(`瑞幸代理启动，端口 ${PORT}`);
});
