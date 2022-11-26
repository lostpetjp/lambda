import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp"

const s3Client = new S3Client({ region: "ap-northeast-1" });

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

export const handler = (event, context, callback) => {
  const record = event.Records[0].s3;

  let src, dst;

  s3Client.send(new GetObjectCommand({
    Bucket: record.bucket.name,
    Key: record.object.key,
  }))
    .then((data) => {
      return streamToString(data.Body);

    })
    .then((str) => {
      const object = JSON.parse(str);
      src = object.src;
      dst = object.dst;

      return s3Client.send(new GetObjectCommand({
        Bucket: src.bucket,
        Key: src.key,
      }));
    })
    .then((data) => {
      return streamToBuffer(data.Body);

    })
    .then(function (buffer) {
      return sharp(buffer).avif({
        quality: 30,
        lossless: !1,
        speed: 0
      }).toBuffer();
    })
    .then(function (buffer) {
      return s3Client.send(new PutObjectCommand({
        ...{
          Bucket: dst.bucket,
          Key: dst.key,
          Body: Buffer.from(buffer, "binary"),
        },
        ...dst.meta,
      }));
    })
    .then(context.succeed)
    .catch(context.fail);
};