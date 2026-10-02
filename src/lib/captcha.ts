import crypto from "crypto";
import sharp from "sharp";
import redis from "./redis";

const TTL = 300;
const key = (token: string) => `captcha:${token}`;

export async function createCaptcha(ip: string) {
  const position = crypto.randomInt(50, 251);
  const token = crypto.randomBytes(32).toString("hex");
  const noise = Array.from({ length: 35 }, () => `<circle cx="${crypto.randomInt(300)}" cy="${crypto.randomInt(150)}" r="${crypto.randomInt(3, 14)}" fill="white" opacity="0.12"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#6366f1"/>${noise}<rect x="${position}" y="55" width="40" height="40" rx="8" fill="#262445" stroke="white" stroke-width="2"/></svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  await redis.setex(key(token), TTL, JSON.stringify({ position, ip, createdAt: Date.now(), attempts: 0, verified: false }));
  return { token, image: `data:image/png;base64,${image.toString("base64")}`, config: { width: 300, height: 150, sliderSize: 40 } };
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
