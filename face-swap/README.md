# Face Swap

Pick a photo of a face and a photo to put it in, and the face in the second
photo is replaced with the first. The swap runs on a GPU at
[Replicate](https://replicate.com) (model
[`cdingram/face-swap`](https://replicate.com/cdingram/face-swap), built on
InsightFace's inswapper), because Vercel's functions have no GPU. A swap
usually takes about 10 seconds (longer when Replicate first boots a GPU) and
costs about $0.012 of Replicate credit, or 80-odd swaps per dollar.

Every result is stamped "AI-generated" in the corner, and the page won't start
a swap until the person ticks that everyone in the photos agreed to it.

## Put it online with Vercel

1. Make a Replicate account, add billing, and copy an API token from
   replicate.com/account/api-tokens.
2. In Vercel: Add New → Project → import the `zero_day` repository again.
3. Set **Root Directory** to `face-swap`.
4. Add **Environment Variables**:
   - `REPLICATE_API_TOKEN`: your Replicate token
   - `ACCESS_CODE` (recommended): any password. The page then asks for it
     before swapping, so strangers who find the link can't spend your
     Replicate credit.
5. Click **Deploy**.

The token stays on the server (`lib/replicate.js`) and is never sent to the
browser.

## How a swap runs

1. The page shrinks both photos (the photo to edit to 1024 px, the face to
   640 px) to JPEGs of about 256 KB and sends them to `api/swap.js`, which
   starts a Replicate prediction and answers with its id straight away.
2. The page polls `api/status.js` every 1.5 seconds. "starting" means
   Replicate is booting a GPU, which can take a minute after a quiet spell.
3. When it has succeeded, the page fetches the image through `api/image.js`
   (so it comes from the same site and can be drawn on a canvas), stamps the
   label on it, and offers it as a PNG download.

Photos are sent to Replicate as data URLs, which Replicate doesn't store;
predictions made through the API, with their output, are deleted after about
an hour. This site keeps nothing.

## Using a different model

Set `REPLICATE_MODEL_VERSION` to the version id of another Replicate model
that takes `input_image` (the photo to edit) and `swap_image` (the face) and
returns one image, for example `codeplugtech/face-swap`. A model with
different input names needs the `input` object in `api/swap.js` changed.

## Video

This app does photos only. Video swaps need minutes of GPU time per clip, so
they'd need a queue and a webhook rather than a page that polls. For video,
run [FaceFusion](https://github.com/facefusion/facefusion) on a GPU host such
as Modal, RunPod or a Hugging Face Space, and keep the same rules: consent and
a visible label.
