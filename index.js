const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LUCKIN_TOKEN;

app.use('/', createProxyMiddleware({
  target: 'https://mcp.lkcoffee.com',
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq) => {
      proxyReq.setHeader('Authorization', `Bearer ${TOKEN}`);
    }
  }
}));

app.listen(PORT, () => {
  console.log(`瑞幸代理跑起来了，端口 ${PORT}`);
});
