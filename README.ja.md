# TTS Speaker (`oc-tts-speaker`)

[English](README.md) | 日本語

**TTS Speaker** は、[OpenClaw](https://github.com/openclaw/openclaw) 用のローカル音声読み上げ拡張機能です。OpenClaw のアシスタント応答を、ローカルで起動している TTS エンジンで音声に変換し、コンピューターの音声出力から再生します。

> **対応 TTS エンジン：** 現在は VOICEVOX Engine のみです。ほかの TTS エンジンには対応していません。

## 目的

- OpenClaw のアシスタント応答をローカルの音声出力から読み上げる。
- ローカルで起動している VOICEVOX Engine にテキストを送信し、音声合成をローカルで行う。
- 再生リクエストをキューに入れ、複数の応答が重なって再生されないようにする。
- デフォルト音声と読み上げ速度を OpenClaw の設定から変更し、音声定義は `voices.json` で管理する。
- アシスタントの出力に `[[tts:speakerVoiceId=ID]]` ディレクティブが含まれる場合、VOICEVOX のスタイルを選択する。

TTS Speaker は独自の再生処理を使用します。同じ応答が二重に読み上げられないようにするには、OpenClaw 標準の自動 TTS を無効にしてください。

## ストリーミング TTS

TTS Speaker は、エージェントの応答生成中に OpenClaw Gateway からアシスタントのテキストを受信できます。ストリーミング中に文が完成すると、応答全体の生成完了を待たずに、その文をローカルの TTS 再生キューに送信します。

処理の流れは次のとおりです。

1. エージェントの実行ごとに、ストリーミングされたテキストを蓄積します。
2. 日本語の句読点および一般的な文末記号（`。`、`！`、`？`、`!`、`?`）を使って、完成した文を検出します。
3. 完成した文を音声合成し、順次再生キューに追加します。
4. 後続の文も、利用可能になり次第、順番に再生します。
5. エージェントの実行終了時に、ストリームバッファに残っているテキストをキューに追加します。
6. その実行でストリーミングテキストを受信できなかった場合は、通常の `agent_end` フォールバックで完成済みのアシスタント応答を再生します。

これにより、ストリーミング中にキューへ追加した応答が、完了時のフォールバックによって二重に再生されることを防ぎます。

ストリーミングハンドラーと `agent_end` フォールバックが同じエージェント実行を正しく識別できるよう、ストリーミング状態は TTS Speaker のプラグイン登録インスタンス間で共有されます。

### 再生の特徴

- **文単位の再生：** モデルが応答全体を生成し終える前に、完成した文の再生を開始できます。
- **順次再生：** 文はキューに入れられ、重ならずに 1 文ずつ再生されます。
- **残りのテキストをバッファリング：** 文末記号のないテキストは、エージェントの実行終了までバッファに保持されます。
- **フォールバック：** ストリーミングを検出できない実行では、通常の完成済み応答の再生処理を使用します。
- **日本語を重視：** 文の分割は日本語の句読点を中心に設計されていますが、一般的な `!`／`?` も文末記号として扱います。

## 必要環境

- OpenClaw
- Node.js `>=24.16.0 <25`
- ローカルで起動した VOICEVOX Engine（既定 URL：`http://127.0.0.1:50021`）
- 使用中の VOICEVOX Engine に存在するスピーカー／スタイル ID

## インストール

リポジトリを clone し、TypeScript をビルドします。

```powershell
git clone https://github.com/byfishself/oc-tts-speaker.git
cd oc-tts-speaker
npm ci
npm run build
```

OpenClaw にローカル拡張機能としてリンクします。

```powershell
openclaw plugins install --link . --force
```

インストール後、プラグインが有効になっていない場合は OpenClaw で有効化してください。プラグインの有効化・初期化時に、音声設定ファイルが存在しなければ自動的に作成されます。ファイルを作成するために設定 UI を開く必要はありません。詳細は、以下の[音声設定ファイル](#音声設定ファイル)を参照してください。

すでにリンク済みの場合、ソースを変更した後に再ビルドし、環境に応じてプラグインを reload するか OpenClaw Gateway を再起動してください。

## 設定

`openclaw.json` の TTS Speaker 設定は意図的に最小限になっています。TTS の実行設定は OpenClaw のプラグイン設定には保存しません。

```json
{
  "plugins": {
    "entries": {
      "tts-speaker": {
        "enabled": true,
        "config": {}
      }
    }
  }
}
```

`plugins.entries.tts-speaker.config` に `speedScale`、`defaultSpeakerId`、`fallbackSpeakerId`、`additionalVoices`、その他の TTS 実行設定を入れないでください。

### 実行設定

永続的な TTS 実行設定は次のファイルに保存されます。

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\config.json
```

このファイルは、プラグイン初期化時に存在しなければ自動的に作成されます。

例：

```json
{
  "enabled": true,
  "agents": {
    "my-agent": {
      "enabled": true,
      "read": "all"
    },
    "coding": {
      "enabled": false,
      "read": "off"
    }
  },
  "speedScale": 1.2
}
```

- `enabled`：TTS 全体の有効／無効。
- `agents`：エージェントごとの TTS 設定。
- `agents.<agentId>.enabled`：そのエージェントを読み上げるかどうか。
- `agents.<agentId>.read`：`off`、`final`、`all` のいずれか。
  - `off`：そのエージェントを読み上げない。
  - `final`：完成した応答だけを読み上げる。
  - `all`：応答生成中に完成した文をストリーミングして再生キューに追加する。
- `speedScale`：VOICEVOX の読み上げ速度倍率。

`<agentId>` には実際の OpenClaw エージェント ID を使用してください。ID は次のコマンドで確認できます。

```powershell
openclaw agents list
```

このファイルで明示的に有効化したエージェントだけが読み上げ対象になります。`agents` に記載されていないエージェントは読み上げられません。

### 音声設定

音声の選択設定は、次のファイルで別途管理します。

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\voices.json
```

このファイルは、プラグイン初期化時に存在しなければ自動的に作成されます。

例：

```json
{
  "defaultSpeakerId": 102,
  "fallbackSpeakerId": 3,
  "voices": [
    {
      "id": 102,
      "description": "Normal voice for ordinary conversation."
    },
    {
      "id": 103,
      "description": "Sweet, affectionate, soft, gentle emotional tone."
    },
    {
      "id": 105,
      "description": "Quiet, intimate, whispering emotional tone."
    }
  ]
}
```

- `defaultSpeakerId`：通常使用する VOICEVOX のスタイル ID。
- `fallbackSpeakerId`：選択した音声を使用できない場合のフォールバック用スタイル ID。
- `voices`：利用可能な音声定義と、その説明。

これらの値は `openclaw.json` では設定しません。

## 音声の選択

組み込みスタイル ID の一覧と、使用中の Engine で利用可能な全スタイルの確認方法は、[VOICEVOX スピーカー／スタイル一覧](VOICEVOX_SPEAKERS.md) を参照してください。

アシスタントの出力に含まれる次のディレクティブを認識します。

```text
[[tts:speakerVoiceId=103]]
```

数値はキャラクター ID ではなく、VOICEVOX の **スタイル ID**（`styles[].id`）です。有効な音声ディレクティブが見つからない場合は、設定されたデフォルト音声を使用します。現在、ディレクティブの生成はアシスタントの出力に依存するため、すべての応答で音声選択が保証されるわけではありません。

## 再生方式と現在の対応範囲

- エージェントの応答生成中に、OpenClaw Gateway からアシスタントのテキストを受信できます。
- 完成した文は、利用可能になり次第、音声合成されて再生されます。
- 音声は VOICEVOX Engine で合成され、ローカルで再生されます。
- 再生リクエストは順次キューに入れられ、文が重なって再生されることはありません。
- エージェントの実行でストリーミングテキストを検出できなかった場合、完成済みのアシスタント応答は `agent_end` フォールバックで処理されます。
- ストリーミング中に文をキューへ追加済みの場合、フォールバックによって応答全体が再生し直されることはありません。

## 開発

```powershell
npm install
npm run build
```

このプロジェクトは TypeScript を使用し、コンパイル済みファイルを `dist/` に出力します。ローカルのシークレット、トークン、個人用 OpenClaw 設定をリポジトリにコミットしないでください。

## ライセンス

本プロジェクトは、リポジトリの [LICENSE](LICENSE) ファイルに記載された条件に従って配布されます。
