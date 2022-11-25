import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { MediaConvertClient, CreateJobCommand } from "@aws-sdk/client-mediaconvert";

const s3Client = new S3Client({ region: "ap-northeast-1" });
const mediaconvertClient = new MediaConvertClient({ endpoint: process.env.ENDPOINT });

export const handler = (event, context, callback) => {
  const srcBucket = event.Records[0].s3.bucket.name;
  const key = event.Records[0].s3.object.key; // upload/src/media/.../{name}.{mov|mp4}

  const tokens = key.split("/");
  const baseName = tokens.pop(); // m12345s123x234z.mp4
  const folder = tokens.join("/");

  const matches = baseName.match(/m([0-9]+)s([0-9]+)x([0-9]+)z\.(mp4|mov)/);
  const width = parseInt(matches[2], 10);
  const height = parseInt(matches[3], 10);
  const direction = height > width ? "v" : "h";

  const paramsH = {
    "Queue": process.env.QUEUE,
    "JobTemplate": "lostpetjp-h",
    "UserMetadata": {},
    "Role": process.env.ROLE,
    "Settings": {
      "OutputGroups": [
        {
          "Name": "File Group",
          "Outputs": [{
            "ContainerSettings": {
              "Container": "RAW"
            },
            "VideoDescription": {
              "Width": 720,
              "ScalingBehavior": "DEFAULT",
              "TimecodeInsertion": "DISABLED",
              "AntiAlias": "ENABLED",
              "Sharpness": 50,
              "CodecSettings": {
                "Codec": "FRAME_CAPTURE",
                "FrameCaptureSettings": {
                  "FramerateNumerator": 1,
                  "FramerateDenominator": 5,
                  "MaxCaptures": 1,
                  "Quality": 80
                }
              },
              "DropFrameTimecode": "ENABLED",
              "ColorMetadata": "INSERT"
            }
          }],
          "OutputGroupSettings": {
            "Type": "FILE_GROUP_SETTINGS",
            "FileGroupSettings": {
              "Destination": "s3://" + srcBucket + "/media-convert/" + folder + "/"
            }
          }
        },
        {
          "Name": "Apple HLS",
          "Outputs": [{
            "ContainerSettings": {
              "Container": "M3U8",
              "M3u8Settings": {
                "AudioFramesPerPes": 4,
                "PcrControl": "PCR_EVERY_PES_PACKET",
                "PmtPid": 480,
                "PrivateMetadataPid": 503,
                "ProgramNumber": 1,
                "PatInterval": 0,
                "PmtInterval": 0,
                "Scte35Source": "NONE",
                "NielsenId3": "NONE",
                "TimedMetadata": "NONE",
                "VideoPid": 481,
                "AudioPids": [
                  482,
                  483,
                  484,
                  485,
                  486,
                  487,
                  488,
                  489,
                  490,
                  491,
                  492
                ]
              }
            },
            "VideoDescription": {
              "Width": 720,
              "ScalingBehavior": "DEFAULT",
              "TimecodeInsertion": "DISABLED",
              "AntiAlias": "ENABLED",
              "Sharpness": 50,
              "CodecSettings": {
                "Codec": "H_264",
                "H264Settings": {
                  "InterlaceMode": "PROGRESSIVE",
                  "NumberReferenceFrames": 3,
                  "Syntax": "DEFAULT",
                  "Softness": 0,
                  "FramerateDenominator": 1001,
                  "GopClosedCadence": 1,
                  "GopSize": 90,
                  "Slices": 1,
                  "GopBReference": "DISABLED",
                  "SlowPal": "DISABLED",
                  "SpatialAdaptiveQuantization": "ENABLED",
                  "TemporalAdaptiveQuantization": "ENABLED",
                  "FlickerAdaptiveQuantization": "DISABLED",
                  "EntropyEncoding": "CABAC",
                  "Bitrate": 2097152,
                  "FramerateControl": "SPECIFIED",
                  "RateControlMode": "CBR",
                  "CodecProfile": "MAIN",
                  "Telecine": "NONE",
                  "FramerateNumerator": 24000,
                  "MinIInterval": 0,
                  "AdaptiveQuantization": "HIGH",
                  "CodecLevel": "AUTO",
                  "FieldEncoding": "PAFF",
                  "SceneChangeDetect": "DISABLED",
                  "QualityTuningLevel": "SINGLE_PASS",
                  "FramerateConversionAlgorithm": "DUPLICATE_DROP",
                  "UnregisteredSeiTimecode": "DISABLED",
                  "GopSizeUnits": "FRAMES",
                  "ParControl": "INITIALIZE_FROM_SOURCE",
                  "NumberBFramesBetweenReferenceFrames": 2,
                  "RepeatPps": "DISABLED"
                  //"DynamicSubGop": "STATIC"
                }
              },
              "AfdSignaling": "NONE",
              "DropFrameTimecode": "ENABLED",
              "RespondToAfd": "NONE",
              "ColorMetadata": "INSERT"
            },
            "AudioDescriptions": [{
              "AudioTypeControl": "FOLLOW_INPUT",
              "AudioSourceName": "Audio Selector 1",
              "CodecSettings": {
                "Codec": "AAC",
                "AacSettings": {
                  "AudioDescriptionBroadcasterMix": "NORMAL",
                  "Bitrate": 96000,
                  "RateControlMode": "CBR",
                  "CodecProfile": "LC",
                  "CodingMode": "CODING_MODE_2_0",
                  "RawFormat": "NONE",
                  "SampleRate": 48000,
                  "Specification": "MPEG4"
                }
              },
              "LanguageCodeControl": "FOLLOW_INPUT"
            }],
            "OutputSettings": {
              "HlsSettings": {
                "AudioGroupId": "program_audio",
                "IFrameOnlyManifest": "EXCLUDE"
              }
            },
            "NameModifier": "/hls"
          }],
          "OutputGroupSettings": {
            "Type": "HLS_GROUP_SETTINGS",
            "HlsGroupSettings": {
              "ManifestDurationFormat": "INTEGER",
              "SegmentLength": 10,
              "TimedMetadataId3Period": 10,
              "CaptionLanguageSetting": "OMIT",
              "Destination": "s3://" + srcBucket + "/src/video/media/", // 設置先
              "TimedMetadataId3Frame": "PRIV",
              "CodecSpecification": "RFC_4281",
              "OutputSelection": "MANIFESTS_AND_SEGMENTS",
              "ProgramDateTimePeriod": 600,
              "MinSegmentLength": 0,
              "DirectoryStructure": "SINGLE_DIRECTORY",
              "ProgramDateTime": "EXCLUDE",
              "SegmentControl": "SEGMENTED_FILES",
              "ManifestCompression": "NONE",
              "ClientCache": "ENABLED",
              "StreamInfResolution": "INCLUDE"
            }
          }
        },
        {
          "Name": "File Group",
          "Outputs": [{
            "ContainerSettings": {
              "Container": "MP4",
              "Mp4Settings": {
                "CslgAtom": "INCLUDE",
                "FreeSpaceBox": "EXCLUDE",
                "MoovPlacement": "PROGRESSIVE_DOWNLOAD"
              }
            },
            "VideoDescription": {
              "Width": 720,
              "ScalingBehavior": "DEFAULT",
              "TimecodeInsertion": "DISABLED",
              "AntiAlias": "ENABLED",
              "Sharpness": 50,
              "CodecSettings": {
                "Codec": "H_264",
                "H264Settings": {
                  "InterlaceMode": "PROGRESSIVE",
                  "NumberReferenceFrames": 3,
                  "Syntax": "DEFAULT",
                  "Softness": 0,
                  "FramerateDenominator": 1001,
                  "GopClosedCadence": 1,
                  "GopSize": 90,
                  "Slices": 1,
                  "GopBReference": "DISABLED",
                  "SlowPal": "DISABLED",
                  "SpatialAdaptiveQuantization": "ENABLED",
                  "TemporalAdaptiveQuantization": "ENABLED",
                  "FlickerAdaptiveQuantization": "DISABLED",
                  "EntropyEncoding": "CABAC",
                  "Bitrate": 2097152,
                  "FramerateControl": "SPECIFIED",
                  "RateControlMode": "CBR",
                  "CodecProfile": "MAIN",
                  "Telecine": "NONE",
                  "FramerateNumerator": 24000,
                  "MinIInterval": 0,
                  "AdaptiveQuantization": "HIGH",
                  "CodecLevel": "AUTO",
                  "FieldEncoding": "PAFF",
                  "SceneChangeDetect": "DISABLED",
                  "QualityTuningLevel": "SINGLE_PASS",
                  "FramerateConversionAlgorithm": "DUPLICATE_DROP",
                  "UnregisteredSeiTimecode": "DISABLED",
                  "GopSizeUnits": "FRAMES",
                  "ParControl": "INITIALIZE_FROM_SOURCE",
                  "NumberBFramesBetweenReferenceFrames": 2,
                  "RepeatPps": "DISABLED"
                  //"DynamicSubGop": "STATIC"
                }
              },
              "AfdSignaling": "NONE",
              "DropFrameTimecode": "ENABLED",
              "RespondToAfd": "NONE",
              "ColorMetadata": "INSERT"
            },
            "AudioDescriptions": [{
              "AudioTypeControl": "FOLLOW_INPUT",
              "CodecSettings": {
                "Codec": "AAC",
                "AacSettings": {
                  "AudioDescriptionBroadcasterMix": "NORMAL",
                  "Bitrate": 96000,
                  "RateControlMode": "CBR",
                  "CodecProfile": "LC",
                  "CodingMode": "CODING_MODE_2_0",
                  "RawFormat": "NONE",
                  "SampleRate": 48000,
                  "Specification": "MPEG4"
                }
              },
              "LanguageCodeControl": "FOLLOW_INPUT"
            }]
          }],
          "OutputGroupSettings": {
            "Type": "FILE_GROUP_SETTINGS",
            "FileGroupSettings": {
              "Destination": "s3://" + srcBucket + "/src/video/media/" // 設置先
            }
          }
        }
      ],
      "AdAvailOffset": 0,
      "Inputs": [{
        "FileInput": "s3://" + srcBucket + "/" + key
      }]
    }
  }

  const paramsV = {
    "Queue": process.env.QUEUE,
    "JobTemplate": "lostpetjp-v",
    "Role": process.env.ROLE,
    "Settings": {
      "OutputGroups": [{
        "Name": "File Group",
        "Outputs": [{
          "ContainerSettings": {
            "Container": "RAW"
          },
          "VideoDescription": {
            "Height": 720,
            "ScalingBehavior": "DEFAULT",
            "TimecodeInsertion": "DISABLED",
            "AntiAlias": "ENABLED",
            "Sharpness": 50,
            "CodecSettings": {
              "Codec": "FRAME_CAPTURE",
              "FrameCaptureSettings": {
                "FramerateNumerator": 1,
                "FramerateDenominator": 5,
                "MaxCaptures": 1,
                "Quality": 80
              }
            },
            "DropFrameTimecode": "ENABLED",
            "ColorMetadata": "INSERT"
          }
        }],
        "OutputGroupSettings": {
          "Type": "FILE_GROUP_SETTINGS",
          "FileGroupSettings": {
            "Destination": "s3://" + srcBucket + "/media-convert/" + folder + "/"
          }
        }
      },
      {
        "Name": "Apple HLS",
        "Outputs": [{
          "ContainerSettings": {
            "Container": "M3U8",
            "M3u8Settings": {
              "AudioFramesPerPes": 4,
              "PcrControl": "PCR_EVERY_PES_PACKET",
              "PmtPid": 480,
              "PrivateMetadataPid": 503,
              "ProgramNumber": 1,
              "PatInterval": 0,
              "PmtInterval": 0,
              "Scte35Source": "NONE",
              "NielsenId3": "NONE",
              "TimedMetadata": "NONE",
              "VideoPid": 481,
              "AudioPids": [
                482,
                483,
                484,
                485,
                486,
                487,
                488,
                489,
                490,
                491,
                492
              ]
            }
          },
          "VideoDescription": {
            "Height": 720,
            "ScalingBehavior": "DEFAULT",
            "TimecodeInsertion": "DISABLED",
            "AntiAlias": "ENABLED",
            "Sharpness": 50,
            "CodecSettings": {
              "Codec": "H_264",
              "H264Settings": {
                "InterlaceMode": "PROGRESSIVE",
                "NumberReferenceFrames": 3,
                "Syntax": "DEFAULT",
                "Softness": 0,
                "FramerateDenominator": 1001,
                "GopClosedCadence": 1,
                "GopSize": 90,
                "Slices": 1,
                "GopBReference": "DISABLED",
                "SlowPal": "DISABLED",
                "SpatialAdaptiveQuantization": "ENABLED",
                "TemporalAdaptiveQuantization": "ENABLED",
                "FlickerAdaptiveQuantization": "DISABLED",
                "EntropyEncoding": "CABAC",
                "Bitrate": 2097152,
                "FramerateControl": "SPECIFIED",
                "RateControlMode": "CBR",
                "CodecProfile": "MAIN",
                "Telecine": "NONE",
                "FramerateNumerator": 24000,
                "MinIInterval": 0,
                "AdaptiveQuantization": "HIGH",
                "CodecLevel": "AUTO",
                "FieldEncoding": "PAFF",
                "SceneChangeDetect": "DISABLED",
                "QualityTuningLevel": "SINGLE_PASS",
                "FramerateConversionAlgorithm": "DUPLICATE_DROP",
                "UnregisteredSeiTimecode": "DISABLED",
                "GopSizeUnits": "FRAMES",
                "ParControl": "INITIALIZE_FROM_SOURCE",
                "NumberBFramesBetweenReferenceFrames": 2,
                "RepeatPps": "DISABLED"
                //"DynamicSubGop": "STATIC"
              }
            },
            "AfdSignaling": "NONE",
            "DropFrameTimecode": "ENABLED",
            "RespondToAfd": "NONE",
            "ColorMetadata": "INSERT"
          },
          "AudioDescriptions": [{
            "AudioTypeControl": "FOLLOW_INPUT",
            "AudioSourceName": "Audio Selector 1",
            "CodecSettings": {
              "Codec": "AAC",
              "AacSettings": {
                "AudioDescriptionBroadcasterMix": "NORMAL",
                "Bitrate": 96000,
                "RateControlMode": "CBR",
                "CodecProfile": "LC",
                "CodingMode": "CODING_MODE_2_0",
                "RawFormat": "NONE",
                "SampleRate": 48000,
                "Specification": "MPEG4"
              }
            },
            "LanguageCodeControl": "FOLLOW_INPUT"
          }],
          "OutputSettings": {
            "HlsSettings": {
              "AudioGroupId": "program_audio",
              "IFrameOnlyManifest": "EXCLUDE"
            }
          },
          "NameModifier": "/hls"
        }],
        "OutputGroupSettings": {
          "Type": "HLS_GROUP_SETTINGS",
          "HlsGroupSettings": {
            "ManifestDurationFormat": "INTEGER",
            "SegmentLength": 10,
            "TimedMetadataId3Period": 10,
            "CaptionLanguageSetting": "OMIT",
            "Destination": "s3://" + srcBucket + "/src/video/media/",
            "TimedMetadataId3Frame": "PRIV",
            "CodecSpecification": "RFC_4281",
            "OutputSelection": "MANIFESTS_AND_SEGMENTS",
            "ProgramDateTimePeriod": 600,
            "MinSegmentLength": 0,
            //"MinFinalSegmentLength": 0,
            "DirectoryStructure": "SINGLE_DIRECTORY",
            "ProgramDateTime": "EXCLUDE",
            "SegmentControl": "SEGMENTED_FILES",
            "ManifestCompression": "NONE",
            "ClientCache": "ENABLED",
            "StreamInfResolution": "INCLUDE"
          }
        }
      },
      {
        "Name": "File Group",
        "Outputs": [{
          "ContainerSettings": {
            "Container": "MP4",
            "Mp4Settings": {
              "CslgAtom": "INCLUDE",
              "FreeSpaceBox": "EXCLUDE",
              "MoovPlacement": "PROGRESSIVE_DOWNLOAD"
            }
          },
          "VideoDescription": {
            "Height": 720,
            "ScalingBehavior": "DEFAULT",
            "TimecodeInsertion": "DISABLED",
            "AntiAlias": "ENABLED",
            "Sharpness": 50,
            "CodecSettings": {
              "Codec": "H_264",
              "H264Settings": {
                "InterlaceMode": "PROGRESSIVE",
                "NumberReferenceFrames": 3,
                "Syntax": "DEFAULT",
                "Softness": 0,
                "FramerateDenominator": 1001,
                "GopClosedCadence": 1,
                "GopSize": 90,
                "Slices": 1,
                "GopBReference": "DISABLED",
                "SlowPal": "DISABLED",
                "SpatialAdaptiveQuantization": "ENABLED",
                "TemporalAdaptiveQuantization": "ENABLED",
                "FlickerAdaptiveQuantization": "DISABLED",
                "EntropyEncoding": "CABAC",
                "Bitrate": 2097152,
                "FramerateControl": "SPECIFIED",
                "RateControlMode": "CBR",
                "CodecProfile": "MAIN",
                "Telecine": "NONE",
                "FramerateNumerator": 24000,
                "MinIInterval": 0,
                "AdaptiveQuantization": "HIGH",
                "CodecLevel": "AUTO",
                "FieldEncoding": "PAFF",
                "SceneChangeDetect": "DISABLED",
                "QualityTuningLevel": "SINGLE_PASS",
                "FramerateConversionAlgorithm": "DUPLICATE_DROP",
                "UnregisteredSeiTimecode": "DISABLED",
                "GopSizeUnits": "FRAMES",
                "ParControl": "INITIALIZE_FROM_SOURCE",
                "NumberBFramesBetweenReferenceFrames": 2,
                "RepeatPps": "DISABLED"
                //"DynamicSubGop": "STATIC"
              }
            },
            "AfdSignaling": "NONE",
            "DropFrameTimecode": "ENABLED",
            "RespondToAfd": "NONE",
            "ColorMetadata": "INSERT"
          },
          "AudioDescriptions": [{
            "AudioTypeControl": "FOLLOW_INPUT",
            "CodecSettings": {
              "Codec": "AAC",
              "AacSettings": {
                "AudioDescriptionBroadcasterMix": "NORMAL",
                "Bitrate": 96000,
                "RateControlMode": "CBR",
                "CodecProfile": "LC",
                "CodingMode": "CODING_MODE_2_0",
                "RawFormat": "NONE",
                "SampleRate": 48000,
                "Specification": "MPEG4"
              }
            },
            "LanguageCodeControl": "FOLLOW_INPUT"
          }]
        }],
        "OutputGroupSettings": {
          "Type": "FILE_GROUP_SETTINGS",
          "FileGroupSettings": {
            "Destination": "s3://" + srcBucket + "/src/video/media/"
          }
        }
      }
      ],
      "AdAvailOffset": 0,
      "Inputs": [{
        "FileInput": "s3://" + srcBucket + "/" + key
      }]
    } //,
    //"StatusUpdateInterval": "SECONDS_60"
  }

  var params = direction === "v" ? paramsV : paramsH; // 縦か横を決定

  s3Client.send(new HeadObjectCommand({
    Bucket: srcBucket,
    Key: key,
  }))
    .then(() => mediaconvertClient.send(new CreateJobCommand(params)))
    .then(context.succeed)
    .catch(context.fail);
}