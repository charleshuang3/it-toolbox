import { describe, it, expect } from "vitest";
import {
  IpError,
  aggregate,
  calculate,
  compareCidrs,
  describeRelation,
  expandIPv6,
  formatBigInt,
  formatIPv4,
  formatIPv6,
  maskToPrefix,
  parseCidrInput,
  parseIPv4,
  parseIPv6,
  rangeInputToCidrs,
  rangeToCidrs,
  formatCidr,
  reverseDns,
  splitByCount,
  splitByPrefix,
} from "./ip-subnet";

const calc = (s: string) => calculate(parseCidrInput(s));

describe("parseIPv4", () => {
  it("parses valid addresses", () => {
    expect(formatIPv4(parseIPv4("192.168.1.1"))).toBe("192.168.1.1");
    expect(parseIPv4("0.0.0.0")).toBe(0n);
    expect(parseIPv4("255.255.255.255")).toBe(0xffffffffn);
  });
  it("rejects invalid octets", () => {
    expect(() => parseIPv4("256.1.1.1")).toThrow(IpError);
    expect(() => parseIPv4("1.2.3")).toThrow(IpError);
    expect(() => parseIPv4("1.2.3.4.5")).toThrow(IpError);
    expect(() => parseIPv4("1.2.3.x")).toThrow(IpError);
    expect(() => parseIPv4("1.2.3.-4")).toThrow(IpError);
    expect(() => parseIPv4("1..2.3")).toThrow(IpError);
  });
  it("rejects leading zeros", () => {
    expect(() => parseIPv4("192.168.01.1")).toThrow(/leading zero/);
    expect(parseIPv4("10.0.0.0")).toBe(0x0a000000n);
  });
});

describe("parseIPv6 / formatting", () => {
  it("parses compressed and full forms", () => {
    expect(parseIPv6("::")).toBe(0n);
    expect(parseIPv6("::1")).toBe(1n);
    expect(parseIPv6("2001:db8::1")).toBe(parseIPv6("2001:0db8:0000:0000:0000:0000:0000:0001"));
    expect(parseIPv6("1:2:3:4:5:6:7::")).toBe(parseIPv6("1:2:3:4:5:6:7:0"));
  });
  it("strips zone ids and brackets", () => {
    expect(parseIPv6("fe80::1%eth0")).toBe(parseIPv6("fe80::1"));
    expect(parseIPv6("[::1]")).toBe(1n);
  });
  it("parses embedded IPv4", () => {
    expect(parseIPv6("::ffff:192.0.2.1")).toBe(0xffffc0000201n);
  });
  it("rejects malformed", () => {
    for (const bad of [
      "1::2::3",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:8:9",
      "12345::1",
      "g::1",
      ":::",
      "1:2:3:4:5:6:7:8::",
      "::ffff:1.2.3.256",
      ":1:2:3:4:5:6:7",
    ]) {
      expect(() => parseIPv6(bad)).toThrow(IpError);
    }
  });
  it("compresses per RFC 5952", () => {
    expect(formatIPv6(0n)).toBe("::");
    expect(formatIPv6(1n)).toBe("::1");
    expect(formatIPv6(parseIPv6("2001:0db8:0:0:1:0:0:1"))).toBe("2001:db8::1:0:0:1");
    // single zero group is not compressed
    expect(formatIPv6(parseIPv6("2001:db8:0:1:1:1:1:1"))).toBe("2001:db8:0:1:1:1:1:1");
    expect(formatIPv6(parseIPv6("2001:DB8::"))).toBe("2001:db8::");
  });
  it("expands", () => {
    expect(expandIPv6(1n)).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
  });
});

describe("parseCidrInput", () => {
  it("handles prefix, netmask, wildcard and bare forms", () => {
    expect(parseCidrInput("10.0.0.0/8").prefix).toBe(8);
    expect(parseCidrInput("10.0.0.5 255.255.255.0").prefix).toBe(24);
    expect(parseCidrInput("10.0.0.5/255.255.255.252").prefix).toBe(30);
    expect(parseCidrInput("10.0.0.5 0.0.0.255").prefix).toBe(24);
    expect(parseCidrInput("10.0.0.5").prefix).toBe(32);
    expect(parseCidrInput("::1").prefix).toBe(128);
    expect(parseCidrInput("  2001:db8::/32 ").prefix).toBe(32);
    expect(parseCidrInput("0.0.0.0 0.0.0.0").prefix).toBe(0);
  });
  it("rejects non-contiguous masks", () => {
    expect(() => parseCidrInput("10.0.0.1 255.0.255.0")).toThrow(/non-contiguous/);
    expect(() => maskToPrefix("255.255.0.255")).toThrow(IpError);
  });
  it("rejects bad prefixes and syntax", () => {
    expect(() => parseCidrInput("10.0.0.1/33")).toThrow(/out of range/);
    expect(() => parseCidrInput("::1/129")).toThrow(/out of range/);
    expect(() => parseCidrInput("10.0.0.1/")).toThrow(IpError);
    expect(() => parseCidrInput("10.0.0.1/-1")).toThrow(IpError);
    expect(() => parseCidrInput("10.0.0.1/a")).toThrow(IpError);
    expect(() => parseCidrInput("10.0.0.1/8/8")).toThrow(IpError);
    expect(() => parseCidrInput("")).toThrow(IpError);
    expect(() => parseCidrInput("1 2 3")).toThrow(IpError);
    expect(() => parseCidrInput("::1 255.0.0.0")).toThrow(IpError);
  });
});

describe("calculate IPv4", () => {
  it("/24", () => {
    const r = calc("192.168.1.77/24");
    expect(r.network).toBe("192.168.1.0");
    expect(r.broadcast).toBe("192.168.1.255");
    expect(r.netmask).toBe("255.255.255.0");
    expect(r.wildcard).toBe("0.0.0.255");
    expect(r.firstHost).toBe("192.168.1.1");
    expect(r.lastHost).toBe("192.168.1.254");
    expect(r.totalAddresses).toBe(256n);
    expect(r.usableHosts).toBe(254n);
    expect(r.cidr).toBe("192.168.1.0/24");
    expect(r.ipClass).toBe("C");
    expect(r.type).toMatch(/Private/);
    expect(r.reverseDns).toBe("77.1.168.192.in-addr.arpa");
  });
  it("/0", () => {
    const r = calc("1.2.3.4/0");
    expect(r.network).toBe("0.0.0.0");
    expect(r.broadcast).toBe("255.255.255.255");
    expect(r.netmask).toBe("0.0.0.0");
    expect(r.totalAddresses).toBe(4294967296n);
    expect(r.usableHosts).toBe(4294967294n);
  });
  it("/31 point-to-point (RFC 3021)", () => {
    const r = calc("10.0.0.1/31");
    expect(r.network).toBe("10.0.0.0");
    expect(r.firstHost).toBe("10.0.0.0");
    expect(r.lastHost).toBe("10.0.0.1");
    expect(r.usableHosts).toBe(2n);
  });
  it("/32 host", () => {
    const r = calc("10.0.0.1/32");
    expect(r.firstHost).toBe("10.0.0.1");
    expect(r.lastHost).toBe("10.0.0.1");
    expect(r.usableHosts).toBe(1n);
    expect(r.totalAddresses).toBe(1n);
  });
  it("/30", () => {
    const r = calc("10.0.0.0/30");
    expect(r.usableHosts).toBe(2n);
    expect(r.firstHost).toBe("10.0.0.1");
    expect(r.lastHost).toBe("10.0.0.2");
  });
  it("classes and types", () => {
    expect(calc("10.1.2.3").ipClass).toBe("A");
    expect(calc("172.16.0.1").ipClass).toBe("B");
    expect(calc("224.0.0.1").ipClass).toBe("D (multicast)");
    expect(calc("250.0.0.1").ipClass).toBe("E (reserved)");
    expect(calc("127.0.0.1").type).toMatch(/Loopback/);
    expect(calc("169.254.1.1").type).toMatch(/Link-local/);
    expect(calc("100.64.0.1").type).toMatch(/Carrier-grade/);
    expect(calc("224.0.0.5").type).toMatch(/Multicast/);
    expect(calc("192.0.2.1").type).toMatch(/Documentation/);
    expect(calc("172.32.0.1").type).toMatch(/Public/);
    expect(calc("172.31.255.255").type).toMatch(/Private/);
    expect(calc("8.8.8.8").type).toMatch(/Public/);
    expect(calc("255.255.255.255").type).toMatch(/broadcast/);
  });
  it("binary split highlights network/host", () => {
    const r = calc("192.168.1.1/20");
    expect(r.binary).toHaveLength(4);
    expect(r.binary[0]).toEqual({ network: "11000000", host: "" });
    expect(r.binary[2]).toEqual({ network: "0000", host: "0001" });
    expect(r.binary[3]).toEqual({ network: "", host: "00000001" });
    expect(r.binary.map((g) => g.network + g.host).join("")).toHaveLength(32);
  });
});

describe("calculate IPv6", () => {
  it("/64", () => {
    const r = calc("2001:db8:1:2:3:4:5:6/64");
    expect(r.network).toBe("2001:db8:1:2::");
    expect(r.broadcast).toBeNull();
    expect(r.netmask).toBe("ffff:ffff:ffff:ffff::");
    expect(r.firstHost).toBe("2001:db8:1:2::");
    expect(r.lastHost).toBe("2001:db8:1:2:ffff:ffff:ffff:ffff");
    expect(r.totalAddresses).toBe(1n << 64n);
    expect(r.cidr).toBe("2001:db8:1:2::/64");
    expect(r.type).toMatch(/Documentation/);
    expect(r.compressed).toBe("2001:db8:1:2:3:4:5:6");
    expect(r.expanded).toBe("2001:0db8:0001:0002:0003:0004:0005:0006");
    expect(r.ipClass).toBeNull();
  });
  it("/128 and /127", () => {
    const a = calc("::1/128");
    expect(a.usableHosts).toBe(1n);
    expect(a.firstHost).toBe("::1");
    expect(a.lastHost).toBe("::1");
    expect(a.type).toBe("Loopback");
    const b = calc("2001:db8::1/127");
    expect(b.totalAddresses).toBe(2n);
    expect(b.usableHosts).toBe(2n);
    expect(b.firstHost).toBe("2001:db8::");
    expect(b.lastHost).toBe("2001:db8::1");
  });
  it("/0", () => {
    const r = calc("::/0");
    expect(r.totalAddresses).toBe(1n << 128n);
    expect(r.lastHost).toBe("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
    expect(r.netmask).toBe("::");
  });
  it("ULA, link-local, multicast, global", () => {
    expect(calc("fd00::1/48").type).toMatch(/ULA/);
    expect(calc("fe80::1%eth0/64").type).toMatch(/Link-local/);
    expect(calc("ff02::1").type).toBe("Multicast");
    expect(calc("2606:4700::1111").type).toBe("Global unicast");
  });
  it("IPv4-mapped", () => {
    const r = calc("::ffff:192.0.2.128/120");
    expect(r.mappedIPv4).toBe("192.0.2.128");
    expect(r.type).toMatch(/IPv4-mapped/);
    expect(r.network).toBe("::ffff:c000:200");
    expect(calc("2001:db8::1").mappedIPv4).toBeNull();
  });
  it("reverse DNS", () => {
    expect(reverseDns(6, parseIPv6("2001:db8::1"))).toBe(
      "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
    );
  });
  it("binary groups are 16 bits", () => {
    const r = calc("2001:db8::/20");
    expect(r.binary).toHaveLength(8);
    expect(r.binary[1]!.network).toBe("0000");
    expect(r.binary[1]!.host).toHaveLength(12);
  });
});

describe("split", () => {
  it("by count", () => {
    const r = splitByCount(parseCidrInput("192.168.0.0/24"), 4);
    expect(r.subnets).toEqual([
      "192.168.0.0/26",
      "192.168.0.64/26",
      "192.168.0.128/26",
      "192.168.0.192/26",
    ]);
    expect(r.truncated).toBe(false);
  });
  it("by prefix, normalising host bits", () => {
    const r = splitByPrefix(parseCidrInput("10.0.0.9/30"), 31);
    expect(r.subnets).toEqual(["10.0.0.8/31", "10.0.0.10/31"]);
  });
  it("same prefix returns itself", () => {
    expect(splitByCount(parseCidrInput("10.0.0.0/8"), 1).subnets).toEqual(["10.0.0.0/8"]);
  });
  it("rejects bad counts / prefixes", () => {
    expect(() => splitByCount(parseCidrInput("10.0.0.0/24"), 3)).toThrow(/power of two/);
    expect(() => splitByCount(parseCidrInput("10.0.0.0/31"), 4)).toThrow(IpError);
    expect(() => splitByCount(parseCidrInput("10.0.0.0/24"), 0)).toThrow(IpError);
    expect(() => splitByPrefix(parseCidrInput("10.0.0.0/24"), 23)).toThrow(IpError);
    expect(() => splitByPrefix(parseCidrInput("10.0.0.0/24"), 33)).toThrow(IpError);
  });
  it("caps rows without freezing on huge splits", () => {
    const r = splitByPrefix(parseCidrInput("2001:db8::/32"), 128);
    expect(r.subnets).toHaveLength(1024);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(1n << 96n);
    expect(r.subnets[1]).toBe("2001:db8::1/128");
    const v4 = splitByPrefix(parseCidrInput("0.0.0.0/0"), 24, 10);
    expect(v4.subnets).toHaveLength(10);
    expect(v4.total).toBe(16777216n);
  });
  it("v6 /48 into /64 is capped", () => {
    const r = splitByPrefix(parseCidrInput("2001:db8::/48"), 64);
    expect(r.total).toBe(65536n);
    expect(r.subnets).toHaveLength(1024);
  });
});

describe("compare", () => {
  const rel = (a: string, b: string) => compareCidrs(parseCidrInput(a), parseCidrInput(b));
  it("contains / contained / equal / disjoint", () => {
    expect(rel("10.0.0.0/8", "10.1.2.3")).toBe("a-contains-b");
    expect(rel("10.1.2.3", "10.0.0.0/8")).toBe("b-contains-a");
    expect(rel("10.0.0.0/24", "10.0.0.7/24")).toBe("equal");
    expect(rel("10.0.0.0/24", "10.0.1.0/24")).toBe("disjoint");
    expect(rel("10.0.0.1", "10.0.0.1")).toBe("equal");
    expect(rel("10.0.0.1", "10.0.0.2")).toBe("disjoint");
    expect(rel("0.0.0.0/0", "255.255.255.255")).toBe("a-contains-b");
    expect(rel("2001:db8::/32", "2001:db8:1::/48")).toBe("a-contains-b");
    expect(rel("2001:db8::/32", "2001:db9::1")).toBe("disjoint");
  });
  it("rejects mixed families", () => {
    expect(() => rel("10.0.0.0/8", "::1")).toThrow(/IPv4.*IPv6/);
  });
  it("describes", () => {
    const d = describeRelation(parseCidrInput("10.0.0.0/8"), parseCidrInput("10.1.1.1"));
    expect(d.relation).toBe("a-contains-b");
    expect(d.text).toContain("10.0.0.0/8 contains 10.1.1.1");
  });
});

describe("range to CIDR", () => {
  it("aligned range is one block", () => {
    expect(rangeInputToCidrs("10.0.0.0 - 10.0.0.255")).toEqual(["10.0.0.0/24"]);
  });
  it("single address", () => {
    expect(rangeInputToCidrs("10.0.0.5-10.0.0.5")).toEqual(["10.0.0.5/32"]);
  });
  it("unaligned range is minimal", () => {
    expect(rangeInputToCidrs("10.0.0.1 - 10.0.0.254")).toEqual([
      "10.0.0.1/32",
      "10.0.0.2/31",
      "10.0.0.4/30",
      "10.0.0.8/29",
      "10.0.0.16/28",
      "10.0.0.32/27",
      "10.0.0.64/26",
      "10.0.0.128/26",
      "10.0.0.192/27",
      "10.0.0.224/28",
      "10.0.0.240/29",
      "10.0.0.248/30",
      "10.0.0.252/31",
      "10.0.0.254/32",
    ]);
  });
  it("full ranges", () => {
    expect(rangeInputToCidrs("0.0.0.0 - 255.255.255.255")).toEqual(["0.0.0.0/0"]);
    expect(rangeInputToCidrs("::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toEqual(["::/0"]);
  });
  it("covers exactly the range (brute-force check)", () => {
    for (const [s, e] of [
      [3, 200],
      [0, 0],
      [7, 8],
      [1, 1023],
      [255, 256],
    ] as const) {
      const cidrs = rangeToCidrs(4, BigInt(s), BigInt(e));
      let covered = 0n;
      let expectedNext = BigInt(s);
      for (const c of cidrs) {
        expect(c.address).toBe(expectedNext);
        // alignment
        expect(c.address % (1n << BigInt(32 - c.prefix))).toBe(0n);
        const size = 1n << BigInt(32 - c.prefix);
        covered += size;
        expectedNext += size;
      }
      expect(covered).toBe(BigInt(e - s + 1));
    }
  });
  it("huge v6 range is fast and bounded", () => {
    const t = Date.now();
    const out = rangeInputToCidrs("::1 - ffff:ffff:ffff:ffff:ffff:ffff:ffff:fffe");
    expect(Date.now() - t).toBeLessThan(1000);
    expect(out.length).toBeLessThanOrEqual(254);
    expect(out[0]).toBe("::1/128");
    expect(out[out.length - 1]).toBe("ffff:ffff:ffff:ffff:ffff:ffff:ffff:fffe/128");
  });
  it("rejects bad ranges", () => {
    expect(() => rangeInputToCidrs("10.0.0.5 - 10.0.0.1")).toThrow(/greater/);
    expect(() => rangeInputToCidrs("10.0.0.1 - ::1")).toThrow(/same IP version/);
    expect(() => rangeInputToCidrs("10.0.0.1")).toThrow(IpError);
    expect(() => rangeInputToCidrs("10.0.0.1 - 10.0.0.300")).toThrow(IpError);
  });
});

describe("aggregate", () => {
  it("merges adjacent and overlapping", () => {
    const r = aggregate("10.0.0.0/25\n10.0.0.128/25\n10.0.0.64/26\n10.0.2.0/24");
    expect(r.v4).toEqual(["10.0.0.0/24", "10.0.2.0/24"]);
    expect(r.inputCount).toBe(4);
    expect(r.errors).toEqual([]);
  });
  it("merges adjacent sibling blocks into a supernet", () => {
    expect(aggregate("10.0.0.0/24, 10.0.1.0/24").v4).toEqual(["10.0.0.0/23"]);
  });
  it("does not merge misaligned adjacent blocks", () => {
    expect(aggregate("10.0.1.0/24\n10.0.2.0/24").v4).toEqual(["10.0.1.0/24", "10.0.2.0/24"]);
  });
  it("accepts bare IPs, netmasks, ranges, comments, mixed families", () => {
    const r = aggregate(
      "# comment\n10.0.0.1\n10.0.0.0 255.255.255.254\n192.168.0.1 - 192.168.0.3\n2001:db8::/33\n2001:db8:8000::/33",
    );
    expect(r.v4).toEqual(["10.0.0.0/31", "192.168.0.1/32", "192.168.0.2/31"]);
    expect(r.v6).toEqual(["2001:db8::/32"]);
  });
  it("normalises host bits and dedupes", () => {
    expect(aggregate("10.0.0.5/24\n10.0.0.0/24\n10.0.0.9").v4).toEqual(["10.0.0.0/24"]);
  });
  it("reports invalid lines but keeps going", () => {
    const r = aggregate("10.0.0.0/8\nbogus\n10.0.0.1/40\n11.0.0.0/8");
    expect(r.v4).toEqual(["10.0.0.0/7"]);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/^bogus/);
  });
  it("handles 0/0 and empty", () => {
    expect(aggregate("0.0.0.0/1\n128.0.0.0/1").v4).toEqual(["0.0.0.0/0"]);
    const e = aggregate("");
    expect(e.v4).toEqual([]);
    expect(e.inputCount).toBe(0);
  });
  it("huge v6 aggregate is fast", () => {
    const r = aggregate("::/1\n8000::/2\nc000::/2");
    expect(r.v6).toEqual(["::/0"]);
  });
});

describe("misc", () => {
  it("formatBigInt", () => {
    expect(formatBigInt(1234567n)).toBe("1,234,567");
    expect(formatBigInt(12n)).toBe("12");
  });
  it("formatCidr normalises", () => {
    expect(formatCidr(parseCidrInput("10.1.2.3/8"))).toBe("10.0.0.0/8");
  });
});
