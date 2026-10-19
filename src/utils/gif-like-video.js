/**
 * Detect gif-as-video elements served as muted looping <video> clips.
 *
 * Modern sites encode animated GIFs as H.264/MP4 with the canonical markup:
 *   <video autoplay loop muted playsinline>
 * Showing a speed overlay on these is noisy and not useful (#1461 / #1407).
 *
 * On X/Twitter the same three attributes also describe real timeline videos:
 * they autoplay muted, often loop when short, and use custom player chrome
 * (no native controls attribute). Treating every loop+muted clip as a GIF
 * therefore drops controllers from real posts (#1485). Narrow the skip on
 * those hosts to true animated_gif assets.
 */

window.VSC = window.VSC || {};

/**
 * @param {string} [hostname]
 * @returns {boolean}
 */
function isTwitterHost(hostname) {
  const host = hostname || (typeof location !== 'undefined' ? location.hostname : '');
  return /(?:^|\.)(?:twitter|x)\.com$/i.test(host);
}

/**
 * Collect src/poster strings that identify the media asset.
 * @param {HTMLVideoElement} video
 * @returns {string}
 */
function collectVideoSources(video) {
  const parts = [];
  if (video.currentSrc) {
    parts.push(video.currentSrc);
  }
  if (video.src) {
    parts.push(video.src);
  }
  if (video.poster) {
    parts.push(video.poster);
  }
  if (typeof video.querySelectorAll === 'function') {
    for (const source of video.querySelectorAll('source')) {
      if (source.src) {
        parts.push(source.src);
      }
    }
  }
  return parts.join(' ');
}

/**
 * X marks animated GIFs with an accessible name / test id containing "GIF".
 * @param {HTMLVideoElement} video
 * @returns {boolean}
 */
function hasTwitterGifLabel(video) {
  let el = video;
  for (let depth = 0; depth < 6 && el; depth += 1) {
    const label = `${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('alt') || ''}`;
    if (/\bGIF\b/i.test(label)) {
      return true;
    }
    // Case-insensitive attribute selectors are supported in Chromium;
    // fall back to a simple contains query when unavailable.
    try {
      if (el.querySelector?.('[aria-label*="GIF" i], [data-testid*="gif" i]')) {
        return true;
      }
    } catch {
      if (el.querySelector?.('[data-testid*="gif"]')) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * True when a video should be treated as a decorative gif-like clip.
 * @param {HTMLMediaElement} video
 * @param {string} [hostname] - Override for tests; defaults to location.hostname
 * @returns {boolean}
 */
function isGifLikeVideo(video, hostname) {
  if (!video || video.tagName !== 'VIDEO') {
    return false;
  }
  if (!(video.loop && video.muted && !video.controls)) {
    return false;
  }

  if (isTwitterHost(hostname)) {
    const haystack = collectVideoSources(video);

    // True X GIFs: silent MP4s under tweet_video/ (thumb posters share the id).
    if (/tweet_video(?:_thumb)?\//i.test(haystack)) {
      return true;
    }

    // Real X videos: amplify/ext_tw CDN paths, or MSE blob streams.
    if (/amplify_video\/|ext_tw_video\//i.test(haystack)) {
      return false;
    }
    if (/\bblob:/i.test(haystack)) {
      return false;
    }

    if (hasTwitterGifLabel(video)) {
      return true;
    }

    // Default on X: keep the controller. Timeline videos share loop+muted+
    // !controls with GIFs, so the generic three-attribute fingerprint alone
    // is not enough (#1485 false positive of #1461).
    return false;
  }

  return true;
}

window.VSC.isGifLikeVideo = isGifLikeVideo;
window.VSC.isTwitterHost = isTwitterHost;
