# SayMaker: AI Video and Image Generator for VS Code

Generate an image or a video clip from the command palette and get the file saved into your workspace. Edit an image, or animate it into a clip, from the explorer's right-click menu. Runs on [SayMaker](https://saymaker.ai/?utm_source=vscode&utm_medium=extension): one API key covers Veo 3.1, Kling 3.0, Seedance 2.0, MiniMax H3, Nano Banana 2, GPT Image 2.5, Seedream 5.0 and the rest of the shelf.

| Command | What it does |
|---|---|
| **SayMaker: Generate Image** | Prompt, then aspect ratio; the image is saved to `assets/` (configurable) and a Markdown link is inserted if a Markdown file is open |
| **SayMaker: Generate Video** | Prompt, then aspect ratio; the clip is saved to `assets/` |
| **SayMaker: Edit Image with AI** | Right-click an image, describe the change; the edited copy is saved next to it |
| **SayMaker: Animate Image into a Video** | Right-click an image, describe the motion; the clip is saved next to it |
| **SayMaker: Set API Key** | Stores your key in VS Code's secret storage |

## Setup

1. Sign up on [saymaker.ai](https://saymaker.ai/?utm_source=vscode&utm_medium=extension) (new accounts get sign-up credits) and create a key at [saymaker.ai/settings/apikeys](https://saymaker.ai/settings/apikeys?utm_source=vscode&utm_medium=extension).
2. Run **SayMaker: Set API Key** and paste it. (`SAYMAKER_API_KEY` in the environment works too.)

## Settings

- `saymaker.outputFolder`: where new files go (default `assets`)
- `saymaker.imageModel`: e.g. `nano-banana-2`, `gpt-image-2-5-flare`, `seedream-5-pro`. Empty uses `saymaker-image-v1`, or `nano-banana-2-lite` for edits.
- `saymaker.videoModel`: e.g. `veo-3-1`, `kling-3-0`, `seedance-2`. Empty uses `minimax-h3-fast`, the video model a free account can run. The others need a plan or a credit pack ([pricing](https://saymaker.ai/pricing?utm_source=vscode&utm_medium=extension)).

For an edit, say what must stay as well as what changes ("put the product on white marble; keep the label unchanged"). That second half is what decides whether the edit holds.

Video takes minutes. Runs on a free account wait in a queue before they start; a paid plan starts them at once. The progress notification has a Cancel button.

Every run lands in your library at [saymaker.ai/history](https://saymaker.ai/history?utm_source=vscode&utm_medium=extension). Free-account output carries a watermark; a paid plan returns the clean file.

MIT licensed. Source: [github.com/hanshs474/saymaker-vscode](https://github.com/hanshs474/saymaker-vscode).
