# VOICEVOX Speakers and Style IDs

[日本語](#日本語)

This document lists the VOICEVOX style IDs referenced by TTS Speaker and explains how to view all styles available in your own VOICEVOX Engine installation.

**Important:** IDs are **style IDs** (`styles[].id`), not character IDs. The styles exposed by `GET /speakers` depend on your installed VOICEVOX Engine, its available voice libraries, and any additional voice packages. The local `/speakers` endpoint is the source of truth for your installation.

## Current voice configuration

TTS Speaker stores voice configuration outside `openclaw.json`:

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\voices.json
```

The file is created automatically when the plugin initializes if it does not exist.

Current default voice definitions:

| Style ID | Description | Role |
| ---: | --- | --- |
| `102` | Normal voice for ordinary conversation. | Default |
| `103` | Sweet, affectionate, soft, gentle emotional tone. | Optional |
| `104` | Sad, sorrowful, disappointed, sympathetic emotional tone. | Optional |
| `105` | Quiet, intimate, whispering emotional tone. | Optional |
| `106` | Special voice for special occasions, such as birthdays. | Optional |
| `3` | VOICEVOX fallback style. | Fallback |

The default configuration is:

```json
{
  "defaultSpeakerId": 102,
  "fallbackSpeakerId": 3,
  "voices": [
    { "id": 102, "description": "Normal voice for ordinary conversation." },
    { "id": 103, "description": "Sweet, affectionate, soft, gentle emotional tone." },
    { "id": 104, "description": "Sad, sorrowful, disappointed, sympathetic emotional tone." },
    { "id": 105, "description": "Quiet, intimate, whispering emotional tone." },
    { "id": 106, "description": "Special voice for special occasions, such as birthdays." }
  ]
}
```

These style IDs are examples from the current TTS Speaker configuration and may not exist in every VOICEVOX installation. Verify them against your local Engine before changing `voices.json`.

The `voices` descriptions are intentionally generic. They describe the intended speaking style rather than exposing character names to the assistant.


## List every style available in your local Engine

Start VOICEVOX Engine, then run the following in PowerShell. The default local API URL is `http://127.0.0.1:50021`.

```powershell
$baseUrl = "http://127.0.0.1:50021"
$speakers = Invoke-RestMethod "$baseUrl/speakers"

$styleList = foreach ($speaker in $speakers) {
    foreach ($style in $speaker.styles) {
        [PSCustomObject]@{
            Character = $speaker.name
            Style     = $style.name
            StyleId   = $style.id
        }
    }
}

$styleList |
    Sort-Object Character, StyleId |
    Format-Table -AutoSize
```

To export the result to a UTF-8 CSV file on your Desktop:

```powershell
$styleList |
    Sort-Object Character, StyleId |
    Export-Csv "$env:USERPROFILE\Desktop\voicevox-styles.csv" -NoTypeInformation -Encoding utf8
```

If your Engine uses a different port, update `$baseUrl`.

## Change the default or available voices

Edit:

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\voices.json
```

Only styles that exist in your local VOICEVOX Engine can actually be synthesized.

Do **not** add voice definitions to `openclaw.json`. The old `additionalVoices` configuration is no longer used.


---

## 日本語

このドキュメントでは、TTS Speaker が参照する VOICEVOX のスタイル ID と、使用中の VOICEVOX Engine で利用できる全スタイルを確認する方法を説明します。

**重要：** ここで示す ID はキャラクター ID ではなく、`styles[].id` にあたる **スタイル ID** です。`GET /speakers` で取得できるスタイルは、インストールされている VOICEVOX Engine、利用可能な音声ライブラリ、追加音声パッケージによって異なります。実際に使用できるかどうかは、ローカルの `/speakers` の結果で確認してください。

## 現在の音声設定

TTS Speaker の音声設定は `openclaw.json` ではなく、次のファイルに保存されます。

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\voices.json
```

ファイルが存在しない場合は、プラグイン初期化時に自動的に作成されます。

現在のデフォルト設定：

| スタイル ID | 説明 | 役割 |
| ---: | --- | --- |
| `102` | 通常会話向けの通常音声。 | デフォルト |
| `103` | 甘く、やさしく、親しみのある感情的な話し方。 | 任意 |
| `104` | 悲しみ、落胆、同情などの感情的な話し方。 | 任意 |
| `105` | 静かで親密な、ささやくような話し方。 | 任意 |
| `106` | 誕生日など、特別な場面向けの音声。 | 任意 |
| `3` | VOICEVOX のフォールバック用スタイル。 | フォールバック |

デフォルト音声とフォールバック音声は次のように設定します。

```json
{
  "defaultSpeakerId": 102,
  "fallbackSpeakerId": 3,
  "voices": [
    { "id": 102, "description": "Normal voice for ordinary conversation." },
    { "id": 103, "description": "Sweet, affectionate, soft, gentle emotional tone." },
    { "id": 104, "description": "Sad, sorrowful, disappointed, sympathetic emotional tone." },
    { "id": 105, "description": "Quiet, intimate, whispering emotional tone." },
    { "id": 106, "description": "Special voice for special occasions, such as birthdays." }
  ]
}
```

これらのスタイル ID は現在の TTS Speaker 設定で使用している例であり、すべての VOICEVOX 環境に存在するとは限りません。変更する前に、使用中の Engine で確認してください。

`voices` の説明は意図的に一般的な表現にしています。キャラクター名ではなく、読み上げる際の声質・感情・用途を表します。


## 使用中の Engine の全スタイルを一覧表示する

VOICEVOX Engine を起動してから、PowerShell で次のコマンドを実行してください。既定のローカル API URL は `http://127.0.0.1:50021` です。

```powershell
$baseUrl = "http://127.0.0.1:50021"
$speakers = Invoke-RestMethod "$baseUrl/speakers"

$styleList = foreach ($speaker in $speakers) {
    foreach ($style in $speaker.styles) {
        [PSCustomObject]@{
            Character = $speaker.name
            Style     = $style.name
            StyleId   = $style.id
        }
    }
}

$styleList |
    Sort-Object Character, StyleId |
    Format-Table -AutoSize
```

結果をデスクトップ上の UTF-8 CSV ファイルに保存する場合：

```powershell
$styleList |
    Sort-Object Character, StyleId |
    Export-Csv "$env:USERPROFILE\Desktop\voicevox-styles.csv" -NoTypeInformation -Encoding utf8
```

Engine のポートを変更している場合は、`$baseUrl` を変更してください。

## デフォルト音声や利用可能な音声を変更する

次のファイルを編集します。

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\voices.json
```

使用中の VOICEVOX Engine に存在するスタイルだけが実際に音声合成できます。

`openclaw.json` に音声定義を追加しないでください。以前の `additionalVoices` 設定は現在使用していません。

