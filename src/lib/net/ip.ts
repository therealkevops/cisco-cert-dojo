export function ipToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function maskOf(len: number): number {
  return len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
}

export type Cidr = { ip: string; len: number; net: number; mask: number };

export function parseCidr(s: string): Cidr | null {
  const m = s.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return null;
  const parts = m[1].split(".").map(Number);
  const len = Number(m[2]);
  if (parts.some((x) => x > 255) || len > 32) return null;
  const mask = maskOf(len);
  return { ip: m[1], len, net: (ipToInt(m[1]) & mask) >>> 0, mask };
}

export function isIp(s: string): boolean {
  return /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split(".").every((x) => Number(x) <= 255);
}

export function inCidr(ip: string, c: Cidr): boolean {
  return ((ipToInt(ip) & c.mask) >>> 0) === c.net;
}

export function cidrNet(c: Cidr): string {
  return `${intToIp(c.net)}/${c.len}`;
}

export function dottedMask(len: number): string {
  return intToIp(maskOf(len));
}

/** Matches an ACL address spec: "any", "host a.b.c.d", or a prefix. */
export function aclAddrMatch(spec: string, ip: string): boolean {
  const s = spec.trim();
  if (s === "any") return true;
  if (s.startsWith("host ")) return s.slice(5).trim() === ip;
  const c = parseCidr(s);
  return c ? inCidr(ip, c) : false;
}

export function validAclAddr(spec: string): boolean {
  const s = spec.trim();
  return s === "any" || (s.startsWith("host ") && isIp(s.slice(5).trim())) || parseCidr(s) !== null;
}
