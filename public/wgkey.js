/* 纯 BigInt 实现的 X25519，用于浏览器端生成 WireGuard 密钥对（零依赖） */
(function (global) {
  'use strict';
  var P = (1n << 255n) - 19n, A24 = 121665n;
  var BASE = new Uint8Array(32); BASE[0] = 9;

  function leToBig(b) { var n = 0n; for (var i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; }
  function bigToLe(n, len) { var o = new Uint8Array(len); for (var i = 0; i < len; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; }
  function inv(x) {
    var r = 1n, b = x % P, e = P - 2n;
    while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
    return r;
  }
  function x25519(sk, u) {
    var k = new Uint8Array(sk);
    k[0] &= 248; k[31] &= 127; k[31] |= 64;
    var x1 = leToBig(u) & ((1n << 255n) - 1n);
    var x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
    var kk = leToBig(k);
    for (var t = 254; t >= 0; t--) {
      var kt = (kk >> BigInt(t)) & 1n;
      swap ^= kt;
      if (swap) { var a1 = x2; x2 = x3; x3 = a1; var a2 = z2; z2 = z3; z3 = a2; }
      swap = kt;
      var a = (x2 + z2) % P, aa = (a * a) % P;
      var b = (x2 - z2 + P) % P, bb = (b * b) % P;
      var e = (aa - bb + P) % P;
      var c = (x3 + z3) % P, d = (x3 - z3 + P) % P;
      var da = (d * a) % P, cb = (c * b) % P;
      var s1 = (da + cb) % P, s2 = (da - cb + P) % P;
      x3 = (s1 * s1) % P;
      z3 = (x1 * s2 * s2) % P;
      x2 = (aa * bb) % P;
      z2 = (e * (aa + A24 * e)) % P;
    }
    if (swap) { var b1 = x2; x2 = x3; x3 = b1; var b2 = z2; z2 = z3; z3 = b2; }
    return bigToLe((x2 * inv(z2)) % P, 32);
  }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return global.btoa(s); }
  function unb64(str) {
    var bin = global.atob(String(str).trim()), o = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
    return o;
  }
  function keypair() {
    var bytes = new Uint8Array(32);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[0] &= 248; bytes[31] &= 127; bytes[31] |= 64;
    return { privateKey: b64(bytes), publicKey: b64(x25519(bytes, BASE)) };
  }
  function publicFromPrivate(str) {
    try { var sk = unb64(str); if (sk.length !== 32) return ''; return b64(x25519(sk, BASE)); }
    catch (e) { return ''; }
  }
  global.WGKey = { keypair: keypair, publicFromPrivate: publicFromPrivate, x25519: x25519, b64: b64, unb64: unb64 };
})(typeof window !== 'undefined' ? window : globalThis);
