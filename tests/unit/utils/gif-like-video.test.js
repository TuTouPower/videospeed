/**
 * Unit tests for gif-as-video detection.
 * Covers the generic #1461 heuristic and the X/Twitter false-positive fix
 * for real timeline videos that also autoplay muted and loop (#1485).
 */

describe('isGifLikeVideo', () => {
  function makeVideo(attrs = {}) {
    const video = document.createElement('video');
    if (attrs.loop) {
      video.loop = true;
    }
    if (attrs.muted) {
      video.muted = true;
    }
    if (attrs.controls) {
      video.controls = true;
    }
    if (attrs.src) {
      video.src = attrs.src;
    }
    if (attrs.poster) {
      video.poster = attrs.poster;
    }
    if (attrs.currentSrc) {
      Object.defineProperty(video, 'currentSrc', {
        configurable: true,
        get: () => attrs.currentSrc,
      });
    }
    if (attrs.sourceSrc) {
      const source = document.createElement('source');
      source.src = attrs.sourceSrc;
      video.appendChild(source);
    }
    return video;
  }

  it('ignores generic loop+muted videos without native controls', () => {
    const video = makeVideo({
      loop: true,
      muted: true,
      src: 'https://cdn.example.com/sticker.mp4',
    });
    expect(window.VSC.isGifLikeVideo(video, 'web.telegram.org')).toBe(true);
  });

  it('keeps controllers when native controls are present', () => {
    const video = makeVideo({
      loop: true,
      muted: true,
      controls: true,
      src: 'https://cdn.example.com/clip.mp4',
    });
    expect(window.VSC.isGifLikeVideo(video, 'example.com')).toBe(false);
  });

  it('keeps controllers when loop or muted is missing', () => {
    expect(
      window.VSC.isGifLikeVideo(makeVideo({ muted: true, src: 'https://a/x.mp4' }), 'example.com')
    ).toBe(false);
    expect(
      window.VSC.isGifLikeVideo(makeVideo({ loop: true, src: 'https://a/x.mp4' }), 'example.com')
    ).toBe(false);
  });

  it('ignores true X animated_gif assets served from tweet_video/', () => {
    const video = makeVideo({
      loop: true,
      muted: true,
      src: 'https://video.twimg.com/tweet_video/DBMDLy_U0AAqUWP.mp4',
    });
    expect(window.VSC.isGifLikeVideo(video, 'x.com')).toBe(true);
    expect(window.VSC.isGifLikeVideo(video, 'www.twitter.com')).toBe(true);
  });

  it('ignores X GIFs identified by tweet_video_thumb posters', () => {
    const video = makeVideo({
      loop: true,
      muted: true,
      poster: 'https://pbs.twimg.com/tweet_video_thumb/DBMDLy_U0AAqUWP.jpg',
    });
    expect(window.VSC.isGifLikeVideo(video, 'x.com')).toBe(true);
  });

  it('does not ignore real X videos streamed via blob MSE URLs', () => {
    const video = makeVideo({
      loop: true,
      muted: true,
      currentSrc: 'blob:https://x.com/abc-123',
    });
    expect(window.VSC.isGifLikeVideo(video, 'x.com')).toBe(false);
  });

  it('does not ignore real X videos on amplify_video / ext_tw_video CDNs', () => {
    const amplify = makeVideo({
      loop: true,
      muted: true,
      src: 'https://video.twimg.com/amplify_video/123/vid/avc1/720x1280/clip.mp4',
    });
    const ext = makeVideo({
      loop: true,
      muted: true,
      sourceSrc: 'https://video.twimg.com/ext_tw_video/456/pu/vid/720x1280/clip.mp4',
    });
    expect(window.VSC.isGifLikeVideo(amplify, 'x.com')).toBe(false);
    expect(window.VSC.isGifLikeVideo(ext, 'twitter.com')).toBe(false);
  });

  it('ignores X clips labeled as GIF in nearby aria attributes', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-label', 'Embedded GIF');
    const video = makeVideo({ loop: true, muted: true });
    wrap.appendChild(video);
    document.body.appendChild(wrap);

    expect(window.VSC.isGifLikeVideo(video, 'x.com')).toBe(true);
    wrap.remove();
  });

  it('defaults to keeping controllers on X when src is ambiguous', () => {
    // Timeline videos often share loop+muted+!controls with GIFs before a
    // CDN URL is known. Prefer attaching a controller over dropping real posts.
    const video = makeVideo({ loop: true, muted: true });
    expect(window.VSC.isGifLikeVideo(video, 'x.com')).toBe(false);
  });
});

describe('SiteHandlerManager.shouldIgnoreVideo + X gif filter', () => {
  afterEach(() => {
    window.VSC.siteHandlerManager.refresh();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('attaches to real X timeline videos that match the old three-attr fingerprint', () => {
    vi.stubGlobal('location', {
      hostname: 'x.com',
      href: 'https://x.com/home',
    });
    window.VSC.siteHandlerManager.refresh();

    const video = document.createElement('video');
    video.loop = true;
    video.muted = true;
    Object.defineProperty(video, 'currentSrc', {
      configurable: true,
      get: () => 'blob:https://x.com/real-post',
    });

    expect(window.VSC.siteHandlerManager.shouldIgnoreVideo(video)).toBe(false);
  });

  it('still skips X animated_gif tweet_video assets', () => {
    vi.stubGlobal('location', {
      hostname: 'x.com',
      href: 'https://x.com/home',
    });
    window.VSC.siteHandlerManager.refresh();

    const video = document.createElement('video');
    video.loop = true;
    video.muted = true;
    video.src = 'https://video.twimg.com/tweet_video/abc.mp4';

    expect(window.VSC.siteHandlerManager.shouldIgnoreVideo(video)).toBe(true);
  });
});
