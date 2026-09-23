const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

marked.setOptions({ gfm: true, breaks: false });

const css = `
  body { margin: 0; padding: 40px 32px 64px; background: #fff; color: #1f2328;
         font: 16px/1.6 -apple-system, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", sans-serif; }
  .box { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 2em; margin: .4em 0; font-weight: 600; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #d1d9e0; padding-bottom: .3em; margin-top: 1.6em; font-weight: 600; }
  h3 { font-size: 1.25em; font-weight: 600; }
  code { background: #f6f8fa; padding: .2em .4em; border-radius: 6px; font: 85% ui-monospace, "SF Mono", Menlo, monospace; }
  pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
  pre code { background: none; padding: 0; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #d1d9e0; padding: 6px 13px; }
  tr:nth-child(even) { background: #f6f8fa; }
  img { max-width: 100%; }
  a { color: #0969da; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #d1d9e0; margin: 2em 0; }
  blockquote { border-left: .25em solid #d1d9e0; color: #59636e; padding: 0 1em; margin: 1em 0; }
`;

const ROOT = '/Users/liaokechen/PiCode';
for (const [src, out] of [['README.md', '.scratch/readme-preview-en.html'], ['README.zh-CN.md', '.scratch/readme-preview-zh.html']]) {
  let body = marked.parse(fs.readFileSync(src, 'utf8'));
  // rewrite repo-relative image paths to absolute file:// URLs (preview lives in .scratch/)
  body = body.replace(/src="(?!https?:|file:|\/|data:)([^"]+)"/g, (_, p) => `src="file://${path.resolve(ROOT, p)}"`);
  fs.writeFileSync(out, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="box">${body}</div></body></html>`);
  console.log(out, 'written');
}
