import crypto from "crypto";
import sharp from "sharp";
import redis from "./redis";

const TTL = 300;
const key = (token: string) => `captcha:${token}`;

export async function createCaptcha(ip: string) {
  const width = 320;
  const height = 160;
  const sliderSize = 48;
  const sliderTop = (height - sliderSize) / 2;
  const position = crypto.randomInt(110, width - sliderSize - 12);
  const token = crypto.randomBytes(32).toString("hex");
  const shape = "M2 12H15C11 2 29 2 25 12H36V23C46 19 46 37 36 33V46H25C29 36 11 36 15 46H2V33C12 37 12 19 2 23Z";
  const peak = crypto.randomInt(105, 150);
  const sunX = crypto.randomInt(42, 90);
  // Both images are rasterized on the server; neither response exposes the answer coordinates.
  const scene = `<defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#dceefa"/><stop offset="1" stop-color="#f0f8fa"/></linearGradient>
    <linearGradient id="lake" x2="0" y2="1"><stop stop-color="#acd9e0"/><stop offset="1" stop-color="#cce9eb"/></linearGradient>
  </defs>
  <rect width="320" height="160" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="37" r="24" fill="#fff" opacity=".3"/>
  <circle cx="${sunX}" cy="37" r="15" fill="#fff9e6"/>
  <path d="M211 28h39m-29 6h50M21 62h40" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <path d="M-15 115L49 60 85 89 ${peak} 38 206 111 263 58 335 112V160H-15Z" fill="#b2cfdc"/>
  <path d="M${peak - 20} 64L${peak} 38 ${peak + 23} 62 ${peak + 7} 57 ${peak - 1} 64 ${peak - 9} 58Z" fill="#f1f8fa" opacity=".9"/>
  <path d="M-18 123Q41 73 95 104T188 111Q249 59 338 108V160H-18Z" fill="#7daebc"/>
  <path d="M-10 139Q64 94 132 126T330 120V160H-10Z" fill="#518e9d"/>
  <path d="M-10 143Q67 117 161 137T330 131V160H-10Z" fill="url(#lake)"/>
  <path d="M42 143h53m123 5h47m-126 5h35" stroke="#f4ffff" stroke-width="2" stroke-linecap="round" opacity=".5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${scene}<path d="${shape}" transform="translate(${position} ${sliderTop})" fill="#173e55" fill-opacity=".48" stroke="white" stroke-opacity=".85" stroke-width="1.5"/></svg>`;
  const pieceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sliderSize}" height="${sliderSize}"><defs><clipPath id="piece"><path d="${shape}"/></clipPath></defs><g clip-path="url(#piece)"><g transform="translate(${-position} ${-sliderTop})">${scene}</g></g><path d="${shape}" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const [image, piece] = await Promise.all([
    sharp(Buffer.from(svg)).png().toBuffer(),
    sharp(Buffer.from(pieceSvg)).png().toBuffer(),
  ]);
  await redis.setex(key(token), TTL, JSON.stringify({ position, ip, createdAt: Date.now(), attempts: 0, verified: false }));
  return { token, image: `data:image/png;base64,${image.toString("base64")}`, piece: `data:image/png;base64,${piece.toString("base64")}`, config: { width, height, sliderSize, sliderTop } };
}

export async function verifyCaptcha(token: string, position: number, ip: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token) || !Number.isFinite(position)) return false;
  const result = await redis.eval(`
    local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
    local data = cjson.decode(raw)
    if data.ip ~= ARGV[1] or data.verified or data.attempts >= 3 then return 0 end
    data.attempts = data.attempts + 1
    local ok = math.abs(data.position - tonumber(ARGV[2])) <= 5 and tonumber(ARGV[3]) - data.createdAt >= 500
    if ok then data.verified = true end
    redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
    if ok then return 1 else return 0 end`, 1, key(token), ip, position, Date.now());
  return result === 1;
}

export async function consumeCaptchaToken(token: string, ip: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return await redis.eval(`
    local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
    local data = cjson.decode(raw)
    if not data.verified or data.ip ~= ARGV[1] then return 0 end
    redis.call('DEL', KEYS[1]); return 1`, 1, key(token), ip) === 1;
}
