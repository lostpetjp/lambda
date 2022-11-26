# 5
- avifファイルを作成する。
- avifの作成には時間を要するため、lambda@edgeで対応するのは不可能。

## 概要
- sharpをlambdaのレイヤーとして登録する。
- インストールする時に依存を解決しておくこと。(`npm install --platform=linux --arch=x64 sharp`)

