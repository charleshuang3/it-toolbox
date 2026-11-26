import { describe, it, expect } from "vitest";
import {
  analyzeChain,
  base64ToBytes,
  bytesToBase64,
  computeValidity,
  formatIp,
  parseInput,
  toPem,
  type CertificateInfo,
  type CsrInfo,
  type ParsedItem,
  type PublicKeyInfo,
} from "./cert-utils";

// Fixtures generated locally with openssl.
const RSA_SELF = `-----BEGIN CERTIFICATE-----
MIIE7zCCA9egAwIBAgIUbXea0FKuN5tM1NSceg05UoPllx0wDQYJKoZIhvcNAQEL
BQAwaTELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFTATBgNVBAoM
DEV4YW1wbGUgQ29ycDEUMBIGA1UECwwLRW5naW5lZXJpbmcxGDAWBgNVBAMMD3d3
dy5leGFtcGxlLmNvbTAeFw0yNjExMjYxMzU4NDFaFw0zNjExMjMxMzU4NDFaMGkx
CzAJBgNVBAYTAlVTMRMwEQYDVQQIDApDYWxpZm9ybmlhMRUwEwYDVQQKDAxFeGFt
cGxlIENvcnAxFDASBgNVBAsMC0VuZ2luZWVyaW5nMRgwFgYDVQQDDA93d3cuZXhh
bXBsZS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC5038FvpOm
Zfz7vYspUbA85u6Rj3IQhXzjr4sQSN4/pAxykP1B4aVEjzLte3PHU8zbvTnmE/Rd
HjnOlyYoQha9fJT36MUTHEl6FnfBubEGnXKU+cnIVR2KBe7yqny7qYa+v7mvuCju
XFLkO7h8N+X8IxCaEtrAF04hv1TLNNcbgRde//mHTjpi548HJcD2x53G9+I4aebT
SO8cx6PoAZAZU8i2pgsuFusihaMD/+1oR5WyDLwAZaJfVwQpeFmlFbBBRQBMyzLe
Qc9qPfM9h+OPh47w0+qjHj32iNac810ubkGY3SJpR6G/4At3GRsvds89sL9mWr/A
9M9OWulK6KLpAgMBAAGjggGNMIIBiTAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQE
AwIFoDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwbAYDVR0RBGUwY4IP
d3d3LmV4YW1wbGUuY29tgg0qLmV4YW1wbGUuY29thwTAAAIBhxAgAQ24AAAAAAAA
AAAAAAABgRFhZG1pbkBleGFtcGxlLmNvbYYWaHR0cHM6Ly9leGFtcGxlLmNvbS9p
ZDAdBgNVHQ4EFgQUPXr23pCyPu/hJg14qc1dFEvjl9YwXQYIKwYBBQUHAQEEUTBP
MCMGCCsGAQUFBzABhhdodHRwOi8vb2NzcC5leGFtcGxlLmNvbTAoBggrBgEFBQcw
AoYcaHR0cDovL2NhLmV4YW1wbGUuY29tL2NhLmNydDAuBgNVHR8EJzAlMCOgIaAf
hh1odHRwOi8vY3JsLmV4YW1wbGUuY29tL2NhLmNybDAbBgNVHSAEFDASMAgGBmeB
DAECATAGBgQqAwQFMBEGBSoDBAUGBAgMBmN1c3RvbTANBgkqhkiG9w0BAQsFAAOC
AQEAdcEDQAbZjuIKiK9gNttNqGWh39zc29/aF1Shrk84F+JLDKKZ2ZRZqNbk9H/Y
BExDDwRHbJ5TcxygnSIYL42PPz6TWf+SOnnlDGdNaCxyE2qa4L9x5mCvsLIj9A4u
5YoPzZEA7N9YNUl+HZ15ukQ4wlXmYLjIV5KNpoA6IGUG0V2Ubg4FXurLJ7vUCMyS
Dvv2FSb5Q85q1ovB82w6TWKHRHXGw/wqHk9QvEoxyrNEKLlQAWkE/hBwZHWTHeWv
6JMqUDLQ27Jz2Edv6is5J80Y2O4dBqKIVSxHEncPKB89+hQxXoKuYlT4ziaR/LBj
tpdqFWf0Ewgi3P0cTnk5Z4rE9g==
-----END CERTIFICATE-----
`;

const CSR_EC = `-----BEGIN CERTIFICATE REQUEST-----
MIICxzCCAm0CAQAwaTELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWEx
FTATBgNVBAoMDEV4YW1wbGUgQ29ycDEUMBIGA1UECwwLRW5naW5lZXJpbmcxGDAW
BgNVBAMMD3d3dy5leGFtcGxlLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IA
BH0mNkWLZK9kKch81jj2NroQ8ztJ/kHCdw81Tuq5KyQH66snr8C+Eo34cpEKztgM
EtK4udxBAUQJOvBp2SwWAQKgggGgMIIBnAYJKoZIhvcNAQkOMYIBjTCCAYkwDAYD
VR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCBaAwHQYDVR0lBBYwFAYIKwYBBQUHAwEG
CCsGAQUFBwMCMGwGA1UdEQRlMGOCD3d3dy5leGFtcGxlLmNvbYINKi5leGFtcGxl
LmNvbYcEwAACAYcQIAENuAAAAAAAAAAAAAAAAYERYWRtaW5AZXhhbXBsZS5jb22G
Fmh0dHBzOi8vZXhhbXBsZS5jb20vaWQwHQYDVR0OBBYEFHjhAMRMOAWrSwJFTQU9
hBhTamWjMF0GCCsGAQUFBwEBBFEwTzAjBggrBgEFBQcwAYYXaHR0cDovL29jc3Au
ZXhhbXBsZS5jb20wKAYIKwYBBQUHMAKGHGh0dHA6Ly9jYS5leGFtcGxlLmNvbS9j
YS5jcnQwLgYDVR0fBCcwJTAjoCGgH4YdaHR0cDovL2NybC5leGFtcGxlLmNvbS9j
YS5jcmwwGwYDVR0gBBQwEjAIBgZngQwBAgEwBgYEKgMEBTARBgUqAwQFBgQIDAZj
dXN0b20wCgYIKoZIzj0EAwIDSAAwRQIhAIa8RWea302GbOn3WApRaBuYrEf3BX3U
fetXNF03khWeAiBV+ujQ3ab0cIWgFusTBHi1IE98m2PjhjwimCTgWFoqRA==
-----END CERTIFICATE REQUEST-----
`;

const ROOT = `-----BEGIN CERTIFICATE-----
MIIBmjCCAUCgAwIBAgIUA9W+bbTelWWKhXbemuHR+97WMyIwCgYIKoZIzj0EAwIw
KzESMBAGA1UECgwJVGVzdCBSb290MRUwEwYDVQQDDAxUZXN0IFJvb3QgQ0EwHhcN
MjYxMTI2MTM1ODQxWhcNMzYxMTIzMTM1ODQxWjArMRIwEAYDVQQKDAlUZXN0IFJv
b3QxFTATBgNVBAMMDFRlc3QgUm9vdCBDQTBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABFI0VuVLSE6nSDqnQDFIjH4k9SfvO9QjY36lISuwSbBTYPM21Ok8yL/Capmq
fmVD/91SMKvd6mJ0LyiSWEupBnWjQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0P
AQH/BAQDAgEGMB0GA1UdDgQWBBRgQYz6fFU69uPozVLByzJjIjcoSDAKBggqhkjO
PQQDAgNIADBFAiEA7P3HNY24G8m8fVxlNupfpqqwmDomNpaz1mWIxKGMqiYCIGBo
3f+WJ2nXjdtthLfQ3y5rLnOGLawr2Cyx3r8f8VG8
-----END CERTIFICATE-----
`;

const INT = `-----BEGIN CERTIFICATE-----
MIIB4jCCAYmgAwIBAgIUZGNOY5yrzG/dxyxRxoaqulhGXIEwCgYIKoZIzj0EAwIw
KzESMBAGA1UECgwJVGVzdCBSb290MRUwEwYDVQQDDAxUZXN0IFJvb3QgQ0EwHhcN
MjYxMTI2MTM1ODQxWhcNMzExMDMxMTM1ODQxWjAzMRIwEAYDVQQKDAlUZXN0IFJv
b3QxHTAbBgNVBAMMFFRlc3QgSW50ZXJtZWRpYXRlIENBMHYwEAYHKoZIzj0CAQYF
K4EEACIDYgAE3LPH2EFPrc1pPEpOo2kWjfguXWerdcNfl4XPMWGYmRTb5sXWJBVo
cP8OQRQvd2wO1WTsvxRhOsjjjB40ir/fO/oky7h6OMhrlqkhjiH0zw5zVw7ptF37
3oCuZb0XzDn2o2YwZDASBgNVHRMBAf8ECDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIB
BjAdBgNVHQ4EFgQUe2wnvFRPADQBzeELbDD0WKM2BVcwHwYDVR0jBBgwFoAUYEGM
+nxVOvbj6M1SwcsyYyI3KEgwCgYIKoZIzj0EAwIDRwAwRAIgOScm97vN4bSrpxem
9+kALTspPdcQdH1+qTgonsn/oxkCIC4xfJAdxqzebH0GLwFj8CpR+1RJ4aBlYuZg
Px3wcuVV
-----END CERTIFICATE-----
`;

const LEAF = `-----BEGIN CERTIFICATE-----
MIIBqzCCATGgAwIBAgIUNcJKXTRNXGNPYQl2rd2FEXDpwaIwCgYIKoZIzj0EAwMw
MzESMBAGA1UECgwJVGVzdCBSb290MR0wGwYDVQQDDBRUZXN0IEludGVybWVkaWF0
ZSBDQTAeFw0yNjExMjYxMzU4NDFaFw0yNzExMjYxMzU4NDFaMBsxGTAXBgNVBAMM
EGxlYWYuZXhhbXBsZS5vcmcwKjAFBgMrZXADIQD2RT+EdjJRsI5S6qnTRePrtUtg
i8RLdzbCjH6zCxgvraNqMGgwCQYDVR0TBAIwADAbBgNVHREEFDASghBsZWFmLmV4
YW1wbGUub3JnMB0GA1UdDgQWBBRl3QJLA5lfF/Gg8dxPv+0L0iyU9DAfBgNVHSME
GDAWgBR7bCe8VE8ANAHN4QtsMPRYozYFVzAKBggqhkjOPQQDAwNoADBlAjEAmy5d
BxTfkGQP+Wr6OWW/berr8p4M3Uf+uJiX0M57/Fo64qPT2YWN2OfYx1KvQrbRAjBl
YMN5mibT3UBFvrQ2NeLvB+KNF7C39fsRpRV7IvzAncqbZn8VT6B0XOCsTAa6UF8=
-----END CERTIFICATE-----
`;

const EXPIRED = `-----BEGIN CERTIFICATE-----
MIIBcTCCARagAwIBAgIUPiXnOZpbDQAD2HvZCJYuwrR/N24wCgYIKoZIzj0EAwIw
HjEcMBoGA1UEAwwTZXhwaXJlZC5leGFtcGxlLmNvbTAeFw0yMDAxMDEwMDAwMDBa
Fw0yMDAxMDIwMDAwMDBaMB4xHDAaBgNVBAMME2V4cGlyZWQuZXhhbXBsZS5jb20w
WTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARsT9PdvEBAUlRXW7Y3N61+Dr06N6C5
blSvZtGTBK9i7q3LVDLRzbUWAfSTpeYfnRqSufD/psEhrgO7/yOpMmz9ozIwMDAd
BgNVHQ4EFgQUrPyoHPjWSKyhjHBlpwtUwgfgokIwDwYDVR0TAQH/BAUwAwEB/zAK
BggqhkjOPQQDAgNJADBGAiEA8cW8M2PF/euK5OUPxaBFr0uDA6JutUYrOxIxZ+/j
THMCIQDerapndYa8jvGjW60vEVJawPT5EPKyXTc2awH4sjULpw==
-----END CERTIFICATE-----
`;

const PUB = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfSY2RYtkr2QpyHzWOPY2uhDzO0n+
QcJ3DzVO6rkrJAfrqyevwL4SjfhykQrO2AwS0ri53EEBRAk68GnZLBYBAg==
-----END PUBLIC KEY-----
`;

const NOW = new Date("2027-01-15T00:00:00Z");

async function certs(input: string | Uint8Array): Promise<CertificateInfo[]> {
  const items = await parseInput(input, NOW);
  return items.filter((i): i is CertificateInfo => i.kind === "certificate");
}

function pemBody(pem: string): string {
  return pem
    .split("\n")
    .filter((l) => !l.startsWith("-----"))
    .join("");
}

describe("self-signed RSA certificate with many extensions", () => {
  let c: CertificateInfo;
  it("parses", async () => {
    const list = await certs(RSA_SELF);
    expect(list).toHaveLength(1);
    c = list[0];
    expect(c.version).toBe(3);
  });

  it("decodes names, serial and fingerprints", () => {
    expect(c.subjectString).toBe(
      "CN=www.example.com, OU=Engineering, O=Example Corp, ST=California, C=US",
    );
    expect(c.subject.map((a) => a.short)).toEqual(["C", "ST", "O", "OU", "CN"]);
    expect(c.issuerString).toBe(c.subjectString);
    expect(c.serial).toBe("6D:77:9A:D0:52:AE:37:9B:4C:D4:D4:9C:7A:0D:39:52:83:E5:97:1D");
    expect(c.fingerprints.sha256).toBe(
      "DA:AD:21:07:82:7D:A9:8A:3E:E9:36:22:52:47:C4:4F:19:78:FC:83:A6:35:E2:DD:13:63:0A:8D:67:1B:09:F3",
    );
    expect(c.fingerprints.sha1).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
  });

  it("decodes key and signature info", () => {
    expect(c.publicKey.algorithm).toBe("RSA");
    expect(c.publicKey.size).toBe(2048);
    expect(c.signatureAlgorithm).toBe("sha256WithRSAEncryption");
  });

  it("is self-signed with a verifying signature", () => {
    expect(c.selfSigned).toBe(true);
    expect(c.selfSignature?.status).toBe("valid");
  });

  it("decodes validity", () => {
    expect(c.validity.status).toBe("valid");
    expect(c.validity.lifetimeDays).toBe(3650);
    expect(c.validity.daysRemaining).toBeGreaterThan(3500);
  });

  it("decodes SANs of every type", () => {
    expect(c.extensions.san).toEqual([
      { type: "DNS", value: "www.example.com" },
      { type: "DNS", value: "*.example.com" },
      { type: "IP", value: "192.0.2.1" },
      { type: "IP", value: "2001:db8::1" },
      { type: "email", value: "admin@example.com" },
      { type: "URI", value: "https://example.com/id" },
    ]);
  });

  it("decodes usages, constraints and identifiers", () => {
    const e = c.extensions;
    expect(e.basicConstraints).toEqual({ ca: false });
    expect(e.keyUsage).toEqual(["Digital Signature", "Key Encipherment"]);
    expect(e.extendedKeyUsage.map((x) => x.name)).toEqual([
      "TLS Web Server Authentication",
      "TLS Web Client Authentication",
    ]);
    expect(e.subjectKeyId).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
  });

  it("decodes AIA, CRL distribution points and policies", () => {
    const e = c.extensions;
    expect(e.authorityInfoAccess).toEqual([
      { method: "OCSP", location: { type: "URI", value: "http://ocsp.example.com" } },
      { method: "CA Issuers", location: { type: "URI", value: "http://ca.example.com/ca.crt" } },
    ]);
    expect(e.crlDistributionPoints).toEqual([
      { type: "URI", value: "http://crl.example.com/ca.crl" },
    ]);
    expect(e.policies.map((p) => p.oid)).toEqual(["2.23.140.1.2.1", "1.2.3.4.5"]);
    expect(e.policies[0].name).toContain("Domain Validated");
  });

  it("lists unrecognised extensions with OID", () => {
    const custom = c.extensions.list.find((x) => x.oid === "1.2.3.4.5.6");
    expect(custom).toBeDefined();
    expect(custom!.recognised).toBe(false);
    expect(custom!.hex).toBe("0c06637573746f6d"); // UTF8String "custom"
    const san = c.extensions.list.find((x) => x.oid === "2.5.29.17");
    expect(san!.recognised).toBe(true);
    expect(san!.name).toBe("Subject Alternative Name");
  });

  it("round-trips PEM and DER", async () => {
    expect(c.pem.trim()).toBe(RSA_SELF.trim());
    const again = await certs(c.der);
    expect(again[0].fingerprints.sha256).toBe(c.fingerprints.sha256);
    const b64 = await certs(pemBody(RSA_SELF));
    expect(b64[0].fingerprints.sha256).toBe(c.fingerprints.sha256);
  });
});

describe("chain: Ed25519 leaf <- P-384 intermediate <- P-256 root", () => {
  it("parses all and reports algorithms", async () => {
    const [leaf, int, root] = await certs(`${LEAF}\n${INT}\n${ROOT}`);
    expect(leaf.publicKey.algorithm).toBe("Ed25519");
    expect(leaf.signatureAlgorithm).toBe("ecdsa-with-SHA384");
    expect(int.publicKey.curve).toContain("P-384");
    expect(int.publicKey.size).toBe(384);
    expect(int.extensions.basicConstraints).toEqual({ ca: true, pathLen: 0 });
    expect(int.extensions.keyUsage).toEqual(["Certificate Sign", "CRL Sign"]);
    expect(root.selfSigned).toBe(true);
    expect(root.selfSignature?.status).toBe("valid");
    expect(leaf.selfSigned).toBe(false);
    expect(leaf.extensions.authorityKeyId?.keyId).toBe(int.extensions.subjectKeyId);
    expect(leaf.extensions.san).toEqual([{ type: "DNS", value: "leaf.example.org" }]);
  });

  it("verifies a correctly ordered chain", async () => {
    const list = await certs(`${LEAF}\n${INT}\n${ROOT}`);
    const a = await analyzeChain(list);
    expect(a.status).toBe("ok");
    expect(a.links.map((l) => l.ok)).toEqual([true, true]);
    expect(a.links.every((l) => l.signature.status === "valid")).toBe(true);
  });

  it("reports an incomplete chain when the root is missing", async () => {
    const a = await analyzeChain(await certs(`${LEAF}\n${INT}`));
    expect(a.status).toBe("incomplete");
    expect(a.links).toHaveLength(1);
  });

  it("flags a misordered chain", async () => {
    const a = await analyzeChain(await certs(`${INT}\n${LEAF}\n${ROOT}`));
    expect(a.status).toBe("misordered");
    expect(a.messages[0]).toContain("misordered");
  });

  it("flags a broken chain when an intermediate is missing", async () => {
    const a = await analyzeChain(await certs(`${LEAF}\n${ROOT}`));
    expect(a.status).toBe("broken");
    expect(a.links[0].nameMatch).toBe(false);
  });

  it("detects a tampered certificate via signature verification", async () => {
    const der = base64ToBytes(pemBody(LEAF));
    const needle = new TextEncoder().encode("leaf.example.org");
    let at = -1;
    for (let i = 0; i < der.length - needle.length; i++) {
      if (needle.every((b, j) => der[i + j] === b)) {
        at = i;
        break;
      }
    }
    expect(at).toBeGreaterThan(0);
    der[at + 3] ^= 1;
    const tampered = await certs(toPem(der, "CERTIFICATE"));
    const [int] = await certs(INT);
    const a = await analyzeChain([tampered[0], int]);
    expect(a.status).toBe("broken");
    expect(a.links[0].signature.status).toBe("invalid");
  });
});

describe("expired certificate", () => {
  it("is reported as expired with negative remaining days", async () => {
    const [c] = await certs(EXPIRED);
    expect(c.validity.status).toBe("expired");
    expect(c.validity.daysRemaining).toBeLessThan(0);
    expect(c.validity.notAfter.toISOString()).toBe("2020-01-02T00:00:00.000Z");
    expect(c.publicKey.curve).toContain("P-256");
  });

  it("computeValidity handles all three states", () => {
    const nb = new Date("2025-01-01T00:00:00Z");
    const na = new Date("2025-01-11T00:00:00Z");
    expect(computeValidity(nb, na, new Date("2024-12-31T00:00:00Z")).status).toBe("not-yet-valid");
    const v = computeValidity(nb, na, new Date("2025-01-05T00:00:00Z"));
    expect(v.status).toBe("valid");
    expect(v.daysRemaining).toBe(6);
    expect(computeValidity(nb, na, new Date("2025-02-01T00:00:00Z")).status).toBe("expired");
  });
});

describe("CSR", () => {
  it("decodes subject, requested extensions, key and verifies the signature", async () => {
    const items = await parseInput(CSR_EC, NOW);
    expect(items).toHaveLength(1);
    const csr = items[0] as CsrInfo;
    expect(csr.kind).toBe("csr");
    expect(csr.subjectString).toContain("CN=www.example.com");
    expect(csr.publicKey.curve).toContain("P-256");
    expect(csr.signatureAlgorithm).toBe("ecdsa-with-SHA256");
    expect(csr.signature.status).toBe("valid");
    expect(csr.extensions.san.map((s) => s.value)).toContain("*.example.com");
    expect(csr.attributes.map((a) => a.oid)).toContain("1.2.840.113549.1.9.14");
    expect(csr.pem.startsWith("-----BEGIN CERTIFICATE REQUEST-----")).toBe(true);
  });

  it("detects a CSR from headerless base64 / DER", async () => {
    const items = await parseInput(pemBody(CSR_EC), NOW);
    expect(items[0].kind).toBe("csr");
  });

  it("detects an invalid CSR signature", async () => {
    const der = base64ToBytes(pemBody(CSR_EC));
    der[der.length - 3] ^= 0xff; // corrupt the end of the signature
    const items = await parseInput(der, NOW);
    expect(items[0].kind).toBe("csr");
    expect((items[0] as CsrInfo).signature.status).not.toBe("valid");
  });
});

describe("public keys and mixed input", () => {
  it("parses a PUBLIC KEY block", async () => {
    const [k] = (await parseInput(PUB, NOW)) as PublicKeyInfo[];
    expect(k.kind).toBe("publickey");
    expect(k.publicKey.summary).toContain("P-256");
  });

  it("handles a mixed bundle with surrounding text", async () => {
    const items = await parseInput(`Server:\n${LEAF}\nCSR:\n${CSR_EC}\n${PUB}`, NOW);
    expect(items.map((i) => i.kind)).toEqual(["certificate", "csr", "publickey"]);
  });

  it("ignores private keys with a warning", async () => {
    const items = await parseInput(
      "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n" + ROOT,
      NOW,
    );
    expect(items.map((i) => i.kind).sort()).toEqual(["certificate", "warning"]);
  });
});

describe("errors", () => {
  it("rejects garbage text", async () => {
    await expect(parseInput("hello world, not a cert", NOW)).rejects.toThrow(/not valid PEM/);
  });

  it("rejects empty input", async () => {
    await expect(parseInput("   ", NOW)).rejects.toThrow(/No data/);
  });

  it("rejects an unterminated PEM", async () => {
    await expect(parseInput("-----BEGIN CERTIFICATE-----\nMIIB", NOW)).rejects.toThrow(/END/);
  });

  it("reports a per-block error for valid base64 that is not a certificate", async () => {
    const items = await parseInput(
      "-----BEGIN CERTIFICATE-----\nAAAAAAAAAAAA\n-----END CERTIFICATE-----",
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("error");
  });

  it("reports an error for truncated DER", async () => {
    const der = base64ToBytes(pemBody(ROOT)).subarray(0, 100);
    const items: ParsedItem[] = await parseInput(der, NOW);
    expect(items[0].kind).toBe("error");
  });

  it("keeps good certificates when one block in a bundle is broken", async () => {
    const items = await parseInput(
      `${ROOT}\n-----BEGIN CERTIFICATE-----\nAAAAAAAAAAAA\n-----END CERTIFICATE-----`,
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(["certificate", "error"]);
  });
});

describe("helpers", () => {
  it("formats IPv4 and IPv6", () => {
    expect(formatIp(new Uint8Array([10, 0, 0, 1]))).toBe("10.0.0.1");
    expect(formatIp(new Uint8Array([0x20, 1, 0xd, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]))).toBe(
      "2001:db8::1",
    );
    expect(formatIp(new Uint8Array(16))).toBe("::");
  });

  it("base64 round trips", () => {
    const b = new Uint8Array([0, 1, 2, 250, 251, 252, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
  });
});
