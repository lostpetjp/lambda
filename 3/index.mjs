import { S3Client, HeadObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
const s3Client = new S3Client({ region: "ap-northeast-1" });

export const handler = (event, context, callback) => {
  const srcBucket = event.Records[0].s3.bucket.name;
  const dstBucket = srcBucket;
  const key = event.Records[0].s3.object.key;  // media-convert/.../.{mov|mp4}

  s3Client.send(new HeadObjectCommand({
    Bucket: srcBucket,
    Key: key
  }))
    .then(() => {
      return s3Client.send(new CopyObjectCommand({
        Bucket: dstBucket,
        Key: key.slice(14).replace(".0000000.jpg", ".jpg"),
        CopySource: srcBucket + "/" + key,
        MetadataDirective: "REPLACE",
        CacheControl: "max-age=2592000,public,immutable",
        ContentType: "image/jpeg",
      }));
    })
    .then(context.succeed)
    .catch(context.fail);
}