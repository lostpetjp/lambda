import { S3Client, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
const s3Client = new S3Client({ region: "ap-northeast-1" });

export const handler = (event, context, callback) => {
  const s3Event = event.Records[0].s3;
  const srcBucket = s3Event.bucket.name;
  const dstBucket = srcBucket;
  const srcKey = s3Event.object.key;
  const dstKey = "dist/" + (srcKey.slice(4)).replace(".0000000.jpg", ".jpg");

  console.log("target:", srcKey);

  s3Client.send(new GetObjectCommand({
    Bucket: srcBucket,
    Key: srcKey,
  }))
    .then((data) => {
      const fileNames = srcKey.split(".");
      const extension = fileNames[fileNames.length - 1];

      const params = {
        Bucket: dstBucket,
        Key: dstKey,	// poster画像用の変換
        CopySource: srcBucket + "/" + srcKey,
        MetadataDirective: "REPLACE"
      };

      if (typeof data.CacheControl === "undefined" || extension === "m3u8") {
        if (dstKey.indexOf("/sw.js") > -1) {
          params.CacheControl = "max-age=600,stale-while-revalidate=600,stale-if-error=864000,public,immutable";

        } else if (dstKey.indexOf("/robots.txt") > -1) {
          params.CacheControl = "max-age=2592000,public,immutable";

        } else if (dstKey.indexOf("/sitemap.xml") > -1) {
          params.CacheControl = "max-age=2592000,public,immutable";

        } else if (dstKey.indexOf("/browserconfig.xml") > -1) {
          params.CacheControl = "max-age=2592000,public,immutable";

        } else if (dstKey.indexOf("/manifest.json") > -1) {
          params.CacheControl = "max-age=2592000,public,immutable";

        } else {
          if (extension === "js" || extension === "css") {
            params.CacheControl = "max-age=2592000,public,immutable";
          } else {
            let CacheControl = 30;

            switch (extension) {
              case "ico":
              case "png":
              case "svg":
              case "ttf":
              case "woff":
              case "woff2":
              case "eot":
              case "otf":
                CacheControl = 365;
                break;
              case "html":
                CacheControl = 1;
                break;
            }

            params.CacheControl = "max-age=" + (86400 * CacheControl).toString() + ",public,immutable";
          }
        }

        if (-1 !== dstKey.indexOf("manifest.webmanifest") || -1 !== dstKey.indexOf("manifest.json")) {
          params.ContentType = "application/manifest+json;charset=utf-8";
        } else if (typeof mimeTypes[extension] !== undefined) {
          params.ContentType = mimeTypes[extension];
        }

      } else {
        params.CacheControl = data.CacheControl;
      }

      return s3Client.send(new CopyObjectCommand(params));
    })
    .then(() => {
      console.log("ok");
      context.succeed();
    })
    .catch((err) => {
      context.fail(err);
    });
}

const mimeTypes = {
  avif: "image/avif",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  html: "text/html;charset=utf-8",
  ico: "image/x-icon",
  css: "text/css;charset=utf-8",
  js: "application/javascript;charset=utf-8",
  json: "application/json;charset=utf-8",
  xml: "application/xml;charset=utf-8",
  ttf: "application/octet-stream",
  woff: "application/x-font-woff",
  woff2: "font/woff2",
  eot: "application/vnd.ms-fontobject",
  otf: "font/opentype",
  webp: "image/webp",
  webm: "video/webm",
  oga: "audio/ogg",
  ogv: "video/ogg",
  txt: "text/plain;charset=utf-8",
  vtt: "text/vtt;charset=utf-8",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  pdf: "application/pdf",
  m3u8: "application/x-mpegURL",
  ts: "video/MP2T",
  dat: "application/octet-stream",
};
