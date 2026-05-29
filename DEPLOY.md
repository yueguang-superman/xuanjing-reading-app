# 发布给别人使用

这个项目已经可以部署成公网网页。部署后，别人只需要打开你的网址就能使用。

## 方式一：Render

1. 把整个项目上传到 GitHub。
2. 打开 Render，选择 New Web Service。
3. 连接这个 GitHub 仓库。
4. Render 会读取 `render.yaml`。
5. 部署成功后，把 Render 给你的网址发给别人。

如果手动填写配置：

- Build Command 留空
- Start Command：`node server.js`
- Health Check Path：`/healthz`
- Environment Variables：
  - `NODE_ENV=production`
  - `HOST=0.0.0.0`

## 方式二：Docker

在服务器上运行：

```bash
docker build -t xuanjing-reading-app .
docker run -p 3000:3000 xuanjing-reading-app
```

然后把服务器的公网地址和端口发给别人，例如：

```text
http://你的服务器IP:3000
```

## 方式三：发压缩包给会运行 Node 的人

对方解压后运行：

```bash
node server.js
```

这只适合对方自己电脑本地体验。如果要让很多人直接打开链接，建议用 Render 或 Docker 部署到服务器。

## 隐私说明

照片不会上传原图。浏览器只提取亮度、对比、线纹密度、对称度等匿名特征值，然后把这些数值发给后端生成娱乐报告。
