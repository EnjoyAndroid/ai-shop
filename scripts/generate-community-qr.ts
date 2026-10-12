import { mkdir } from "node:fs/promises";
import QRCode from "qrcode";
import { getCommunityEntryUrl } from "../src/lib/community-settings";

async function main() {
  const siteUrl = process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) throw new Error("请提供站点 URL，或配置 NEXT_PUBLIC_SITE_URL");
  const entryUrl = getCommunityEntryUrl(siteUrl);
  await mkdir("docs/community", { recursive: true });
  await QRCode.toFile("docs/community/wechat-entry.png", entryUrl, {
    width: 320, margin: 4, errorCorrectionLevel: "M",
  });
  console.log(`Fixed community entry: ${entryUrl}`);
  console.log("Saved docs/community/wechat-entry.png; update README links as well when changing the domain.");
}

void main().catch(() => {
  process.stderr.write("二维码生成失败，请检查站点地址与输出目录；地址需使用 HTTP/HTTPS 且不包含登录凭据。\n");
  process.exitCode = 1;
});
