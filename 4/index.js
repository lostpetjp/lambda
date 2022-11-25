const S3 = new (require("aws-sdk")["S3"])({
  "apiVersion": "2006-03-01"
});
const sharp = require("sharp");
const imagemin = require("imagemin");
const mozjpeg = require("imagemin-mozjpeg");
const pngquant = require("imagemin-pngquant");

const getMimeType = function (extension) {
  switch (extension) {
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    // case "gif":
    //   return "image/gif";
    case "webp":
      return "image/webp"
    // case "avif": // => avif未対応
    //  return "image/avif"
  }
};

const getFolderKey = function (id) {
  const start1 = Math.floor(id / 100000000) * 100000000;
  const start2 = Math.floor(id / 1000000) * 1000000;
  const start3 = Math.floor(id / 10000) * 10000;
  const start4 = Math.floor(id / 100) * 100;

  return Math.max(1, (start1)) + "-" + (start1 + 100000000 - 1) + "/" + Math.max(1, (start2)) + "-" + (start2 + 1000000 - 1) + "/" + Math.max((start3), 1) + "-" + (start3 + 10000 - 1) + "/" + Math.max((start4), 1) + "-" + (start4 + 100 - 1);
};

exports.handler = function (event, context, callback) {
  new Process(event, context, callback);
};

const Process = function (event, context, callback) {
  this.status = 1;
  this.event = event;
  this.context = context;
  this.callback = callback;

  var cf = event.Records[0].cf;
  var request = this.request = cf.request;
  this.pathname = request.uri;

  // 画像のパターン (/media/...) m{123}s{56}x{78}z.(jpg|png)
  this.createDefaultImage();
};

Process.prototype = {
  check: async function (order) {
    var newOrder = [];

    while (order.length) {
      var currentOrder = order.pop();
      var distObject = currentOrder.dist;

      var bucket = distObject.bucket;
      var key = distObject.key;

      /*
      {
         AcceptRanges: 'bytes',
         LastModified: 2021-09-17T04:02:59.000Z,
         ContentLength: 635,
         ETag: '"d330e20fc2048f970544f196c6b57910"',
         CacheControl: 'max-age=31536000,public,immutable',
         ContentType: 'image/png',
         ServerSideEncryption: 'AES256',
         Metadata: {},
         Body: <Buffer 89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52 00 00 00 b4 00 00 00 b4 08 03 00 00 00 0a 13 f6 00 00 00 00 9c 50 4c 54 45 ff ff ff 53 53 5f c0 39 2b ... 585 more bytes>
       }
      */
      try {
        await S3.getObject({
          Bucket: bucket,
          Key: key,
        }).promise();
        // 最終Entryのdistがあれば、何もする必要がない
        if (1 === currentOrder.done) break;
      } catch (err) {
        newOrder.unshift(currentOrder);
      }
    }

    return newOrder;
  },

  create: function (order) {
    this.check(order)
      .then(async (order) => {
        if (order.length) {
          try {
            var abortController = {
              status: 0,
            };

            for (var i = 0; order.length > i; i++) {
              await this.createProcess(order[i], abortController);
              if (1 === abortController.status) return;
            }
          } catch (err) {
            this.error(err);

          }
        }

        this.done();
      })
      .catch(this.error);
  },

  createProcess: function (entry, abortController) {
    return new Promise((resolve, reject) => {
      var srcObject = entry.src;
      var distObject = entry.dist;
      var commandStr = entry.command;
      var commandObject = commandStr ? new CommandParser(commandStr) : null;
      var width = null;
      var height = null;
      var extension = entry.extension;
      var isWebp = "webp" === extension;
      var prefix = entry.prefix;
      var suffix = entry.suffix;

      if (commandObject) {
        if (commandObject.error) throw "command";
        width = commandObject.width;
        height = commandObject.height;
        var direction = commandObject.direction; // "w" or "h"
        var size = commandObject.size;
        var aspect = commandObject.aspect;

        var method = entry.method;
        var naturalWidth = entry.naturalWidth;
        var naturalHeight = entry.naturalHeight;

        // aspect指定がなく、かつ、元画像より大きい場合、元画像にリダイレクトをかける
        if (!width || !height) {
          if ((width && (width > naturalWidth)) || (height && (height > naturalHeight))) {
            this.redirect(prefix + suffix, 365 * 86400);
            abortController.status = 1;
            return this[method]();
          }
          // aspectがある(=width && height)場合、サイズ超過していたら、限界のサイズにリダイレクトする
        } else if (size > 100) {
          var naturalSize = "w" === direction ? naturalWidth : naturalHeight;

          if (size > naturalSize) {
            var newSize = null;

            for (var a = [100, 300, 600, 900, 1200, 1500, 1800], i = 0; a.length > i; i++) {
              var _size = a[i];
              if (_size === size || _size > naturalSize) break;
              newSize = _size;
            }

            if (newSize && size !== newSize) {
              this.redirect(prefix + ("-" + direction + newSize + aspect) + suffix, 365 * 86400);
              abortController.status = 1;
              return this[method]();
            }
          }
        }
      }

      this.S3GetObject(srcObject.bucket, srcObject.key)
        .then((data) => {
          var sharp = this.createSharp(extension, data.Body);
          if (!isWebp && (width || height)) sharp = sharp.resize(width, height);

          return Promise.all([
            data,
            sharp.toBuffer(),
          ]);

        })
        .then((res) => {
          var binary;

          if (res[1]) {
            var buffer = Buffer.from(res[1], "binary");

            binary = (isWebp) ? Promise.resolve(buffer) : imagemin["buffer"](buffer, {
              plugins: [mozjpeg({
                quality: 80,
                progressive: !0
              }), pngquant({
                quality: [.6, .8],
                speed: 1,
                strip: !0
              })]
            });
          }

          return Promise.all([
            res[0],
            binary,
          ]);
        })
        .then((res) => {
          var sourceS3Data = res[0];
          var binary = res[1];

          if (binary) {
            return this.S3PutObject(
              distObject.bucket,
              distObject.key,
              (!isWebp && (!width || !height) && (binary.length > sourceS3Data.ContentLength)) ? sourceS3Data.Body : binary,
              {
                CacheControl: "max-age=" + entry.cacheTime + ",public,immutable",
                ContentType: getMimeType(extension),
                // "Tagging": "expires=3m", // 不要
              }
            );
          }
        })
        .then(resolve)
        .catch(reject);

    });
  },

  done: function () {
    if (1 === this.status) {
      this.status = 0;
      this.callback(null, this.request);
    }
  },

  error: function (err) {
    console.log("err:", err);

    if (1 === this.status) {
      this.status = 0;

      return this.callback(null, {
        status: "302",
        statusDescription: "Found",
        headers: {
          "cache-control": [{
            key: "Cache-Control",
            value: "max-age=10,public,immutable"
          }],
          location: [{
            key: "Location",
            value: "https://" + process.env.HOSTNAME + "/error.svg"
          }]
        }
      });
    }
  },

  redirect: function (redirectPathname, cacheTime) {
    if (1 === this.status) {
      this.status = 0;
      this.pathname = "/" + redirectPathname;

      return this.callback(null, {
        status: "301",
        statusDescription: "Found",
        headers: {
          "cache-control": [{
            key: "Cache-Control",
            value: "max-age=" + cacheTime + ",public,immutable"
          }],
          location: [{
            key: "Location",
            value: "https://" + process.env.HOSTNAME + "/" + redirectPathname
          }]
        }
      });
    }
  },

  S3GetObject: function (bucket, key) {
    return new Promise(function (resolve, reject) {
      S3.getObject({
        Bucket: bucket,
        Key: key,
      }, function (err, data) {
        return err ? reject(err) : resolve(data);
      });
    });
  },

  /*
  "CacheControl": 'max-age=86400,public',
  "ContentType": getMimeType(sourceKey),
  */
  S3PutObject: function (bucket, key, body, requestOptions) {
    return new Promise(function (resolve, reject) {
      S3.putObject(Object.assign({
        Bucket: bucket,
        Key: key,
        Body: body, // new Buffer(outputBuffer, 'binary'),
      }, requestOptions), function (err, data) {
        return err ? reject(err) : resolve(data);
      });
    });
  },

  createSharp: function (type, body) {
    switch (type) {
      case "jpg":
        return sharp(body).jpeg({
          progressive: !0
        });
      case "png":
        return sharp(body).png({
          compressionLevel: 9,
          adaptiveFiltering: !0,
          progressive: !0
        });
      case "avif":
        return sharp(body).avif({
          quality: 30,
          lossless: !1,
          speed: 0
        });
      case "webp":
        return sharp(body).webp({
          quality: 75,
          lossless: !1,
          nearLossless: !1,
          smartSubsample: !0,
          reductionEffort: 6,
          progressive: !0
        });
    }
  },

  createDefaultImage: function () {
    // "/media/m{123}s{56}x{78}z-w100.(jpg|png)(.webp)?"
    /*
    0: "/media/m123s56x78z-w100.jpg.webp"
    1: "m123s56x78z-w100.jpg.webp"
    2: "m123s56x78z-w100.jpg"
    3: "m123s56x78z"
    4: "123"
    5: "56"
    6: "78"
    7: "-w100"
    8: "w100"
    9: "jpg"
    10: ".webp"
    */

    const bucket = process.env.BUCKET;
    var matches = this.pathname.match(/^\/media\/(((m([0-9]+)s([0-9]+)x([0-9]+)z)(-)?([a-zA-Z0-9]+)?\.(jpg|png))(\.webp)?)$/);

    if (matches) {
      var basename = matches[2];
      var filename = matches[3];
      var mediaId = parseInt(matches[4], 10);
      var naturalWidth = parseInt(matches[5], 10);
      var naturalHeight = parseInt(matches[6], 10);
      var command = matches[8];
      var extension = matches[9];
      var webp = matches[10];

      var distDir = "dist/image/media/";

      // 大元、webpの元などがある
      return this.create([
        // 0: 大元
        {
          index: 0,
          src: { // ソースファイル
            bucket: bucket,
            key: "upload/src/media/" + getFolderKey(mediaId) + "/" + filename + "." + extension,
          },
          dist: { //
            bucket: bucket,
            key: distDir + filename + "." + extension,
          },
          extension: extension,
          cacheTime: 365 * 86400,
        },
        // 1: コマンド追加 => コマンドがなければ省略
        command ? {
          index: 1,
          src: {
            bucket: bucket,
            key: distDir + filename + "." + extension,
          },
          dist: {
            bucket: bucket,
            key: distDir + basename,
          },
          extension: extension,
          command: command,
          cacheTime: 365 * 86400,
          naturalWidth: naturalWidth,
          naturalHeight: naturalHeight,
          // 元画像へのリダイレクトをかける場合
          prefix: "media/" + filename,
          suffix: "." + extension + (webp ? webp : ""),
          method: "createDefaultImage",
        } : null,
        // 2: webp追加 (元のソースをwebpに変換するだけ)
        webp ? {
          index: 2,
          done: 1, // このEntryのdistが存在すれば処理は不要
          src: {
            bucket: bucket,
            key: distDir + basename,
          },
          dist: {
            bucket: bucket,
            key: distDir + basename + webp,
          },
          extension: "webp",
          cacheTime: 365 * 86400,

          command: command,
          prefix: "media/" + filename,
          suffix: "." + extension + (webp ? webp : ""),
        } : null,
      ].filter(Boolean));
    }

    this.error();
  },
};

const CommandParser = function (commandStr) {
  this.width = null;
  this.height = null;
  this.size = null;
  this.aspect = null;
  this.direction = null;

  if (commandStr) {
    var matches = commandStr.match(/^(w|h)(100|300|600|900|1200|1500|1800)(a(11|21|3245|3610|219|169|1911|43))?$/);
    /*
     0: "w300a11"
     1: "w"
     2: "300"
     3: "11"
    */

    if (matches) {
      var direction = this.direction = matches[1]; // "w" or "h"
      var size = this.size = parseInt(matches[2], 10); // "999"
      var aspect = matches[4]; // "11"
      this.aspect = (aspect ? "a" + aspect : "");
      var property1 = "w" === direction ? "width" : "height";
      var property2 = "w" === direction ? "height" : "width";

      if (!aspect) {
        this[property1] = size;

      } else {
        switch (aspect) {
          case "11":
            this.width = this.height = size;
            break;
          case "21":
            this[property1] = size;
            this[property2] = size / 2;
            break;
          case "3245":
            switch (size) {
              case 100:
                this[property1] = 160;
                this[property2] = 225;
                break;
              case 300:
                this[property1] = 320;
                this[property2] = 450;
                break;
              case 600:
                this[property1] = 640;
                this[property2] = 900;
                break;
              case 900:
                this[property1] = 960;
                this[property2] = 1350;
                break;
              case 1200:
                this[property1] = 1280;
                this[property2] = 1800;
                break;
              case 1500:
                this[property1] = 1600;
                this[property2] = 1000;
                break;
              case 1800:
                this[property1] = 1920;
                this[property2] = 2700;
                break;
            }
            break;
          case "3610":
            switch (size) {
              case 100:
                this[property1] = 360;
                this[property2] = 100;
                break;
              case 300:
                this[property1] = 432;
                this[property2] = 120;
                break;
              case 600:
                this[property1] = 648;
                this[property2] = 180;
                break;
              case 900:
                this[property1] = 1080;
                this[property2] = 300;
                break;
              case 1200:
                this[property1] = 1260;
                this[property2] = 350;
                break;
              case 1500:
                this[property1] = 1620;
                this[property2] = 450;
                break;
              case 1800:
                this[property1] = 1980;
                this[property2] = 550;
                break;
            }
            break;
          case "219":
            switch (size) {
              case 100:
                this[property1] = 210;
                this[property2] = 90;
                break;
              case 300:
                this[property1] = 350;
                this[property2] = 150;
                break;
              case 600:
                this[property1] = 630;
                this[property2] = 270;
                break;
              case 900:
                this[property1] = 980;
                this[property2] = 420;
                break;
              case 1200:
                this[property1] = 1260;
                this[property2] = 540;
                break;
              case 1500:
                this[property1] = 1540;
                this[property2] = 660;
                break;
              case 1800:
                this[property1] = 1820;
                this[property2] = 780;
                break;
            }
            break;
          case "169":
            switch (size) {
              case 100:
                this[property1] = 96;
                this[property2] = 54;
                break;
              case 300:
                this[property1] = 320;
                this[property2] = 180;
                break;
              case 600:
                this[property1] = 640;
                this[property2] = 360;
                break;
              case 900:
                this[property1] = 960;
                this[property2] = 540;
                break;
              case 1200:
                this[property1] = 1280;
                this[property2] = 720;
                break;
              case 1500:
                this[property1] = 1600;
                this[property2] = 900;
                break;
              case 1800:
                this[property1] = 1920;
                this[property2] = 1080;
                break;
            }
            break;
          case "1911":
            switch (size) {
              case 100:
                this[property1] = 191;
                this[property2] = 100;
                break;
              case 300:
                this[property1] = 320;
                this[property2] = 168;
                break;
              case 600:
                this[property1] = 640;
                this[property2] = 335;
                break;
              case 900:
                this[property1] = 960;
                this[property2] = 502;
                break;
              case 1200:
                this[property1] = 1280;
                this[property2] = 670;
                break;
              case 1500:
                this[property1] = 1600;
                this[property2] = 838;
                break;
              case 1800:
                this[property1] = 1920;
                this[property2] = 1005;
                break;
            }
            break;
          case "43":
            switch (size) {
              case 100:
                this[property1] = 120;
                this[property2] = 90;
                break;
              case 300:
                this[property1] = 320;
                this[property2] = 240;
                break;
              case 600:
                this[property1] = 640;
                this[property2] = 480;
                break;
              case 900:
                this[property1] = 960;
                this[property2] = 720;
                break;
              case 1200:
                this[property1] = 1280;
                this[property2] = 960;
                break;
              case 1500:
                this[property1] = 1600;
                this[property2] = 1200;
                break;
              case 1800:
                this[property1] = 1800;
                this[property2] = 1350;
                break;
            }
            break;
        }

      }
    } else {
      this.error = 1;
    }
  }
};





