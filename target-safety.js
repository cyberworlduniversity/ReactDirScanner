"use strict";

const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4Number(address) {
  if (net.isIP(address) !== 4) return null;
  return address.split(".").reduce((n, part) => ((n * 256) + Number(part)) >>> 0, 0);
}

function inCidr(address, network, prefix) {
  const ip = ipv4Number(address);
  const base = ipv4Number(network);
  if (ip === null || base === null) return false;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (base & mask);
}

function isPublicIPv4(address) {
  return net.isIP(address) === 4 && !BLOCKED.some(([network, prefix]) => inCidr(address, network, prefix));
}

function normalizeTargetUrl(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 2048) {
    throw new Error("A target URL up to 2048 characters is required.");
  }
  const raw = input.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS targets are allowed.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("Only standard HTTP and HTTPS ports are allowed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname) === 6) throw new Error("IPv6 targets are not supported by this scanner.");
  if (net.isIP(hostname) === 4 && !isPublicIPv4(hostname)) throw new Error("Private or special-use IP targets are blocked.");
  return url;
}

async function resolvePublicTarget(input) {
  const url = normalizeTargetUrl(input);
  const hostname = url.hostname;
  const addresses = net.isIP(hostname) === 4 ? [hostname] : await dns.resolve4(hostname);
  if (!addresses.length || addresses.some((address) => !isPublicIPv4(address))) {
    throw new Error("Target resolves to a private or special-use address and is blocked.");
  }
  return { url, hostname, address: addresses[0] };
}

function createPinnedAgents(target) {
  const lookup = (_hostname, options, callback) => {
    if (options && options.all) return callback(null, [{ address: target.address, family: 4 }]);
    callback(null, target.address, 4);
  };
  return {
    httpAgent: new http.Agent({ keepAlive: false, lookup }),
    httpsAgent: new https.Agent({ keepAlive: false, lookup }),
  };
}

module.exports = { createPinnedAgents, isPublicIPv4, normalizeTargetUrl, resolvePublicTarget };
