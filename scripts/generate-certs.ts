import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { networkInterfaces } from "os";

/**
 * Generate TLS / SSL Certificates with Subject Alternative Names (SAN)
 * covering localhost, 127.0.0.1, and all active local LAN IP addresses.
 *
 * This allows modern browsers (Chrome, Safari, Edge, Firefox) on phones
 * and peer machines on the local network to accept HTTPS without CN mismatches.
 */
export async function generateCertificates(customIp?: string): Promise<{
  certPath: string;
  keyPath: string;
  sanList: string[];
}> {
  const certsDir = join(process.cwd(), "certs");
  if (!existsSync(certsDir)) {
    mkdirSync(certsDir, { recursive: true });
  }

  const certPath = join(certsDir, "cert.pem");
  const keyPath = join(certsDir, "key.pem");
  const configPath = join(certsDir, "openssl-san.cnf");

  // Collect DNS names and IP addresses for SAN
  const dnsNames = ["localhost"];
  const ipAddresses = new Set<string>(["127.0.0.1"]);

  // Detect local network IP addresses
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ipAddresses.add(net.address);
      }
    }
  }

  // Add custom IP from argument or environment variable if provided
  const envIp = customIp || process.env.HOST_IP;
  if (envIp) {
    ipAddresses.add(envIp);
  }

  const sanDnsLines = dnsNames.map((dns, idx) => `DNS.${idx + 1} = ${dns}`).join("\n");
  const sanIpLines = Array.from(ipAddresses)
    .map((ip, idx) => `IP.${idx + 1} = ${ip}`)
    .join("\n");

  const opensslConfig = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = req_distinguished_name
x509_extensions = v3_req

[req_distinguished_name]
C = US
ST = Secure
L = Local
O = SecureChat Development
OU = Cryptographic Core
CN = localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
${sanDnsLines}
${sanIpLines}
`.trim();

  writeFileSync(configPath, opensslConfig);

  console.log(`[Certs] Generating 2048-bit RSA TLS certificate with SAN...`);
  console.log(`[Certs] SAN DNS: ${dnsNames.join(", ")}`);
  console.log(`[Certs] SAN IPs: ${Array.from(ipAddresses).join(", ")}`);

  // Run OpenSSL command to generate self-signed key and cert
  const proc = Bun.spawn([
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "365",
    "-config",
    configPath,
  ]);

  const exitCode = await proc.exited;

  // Clean up temporary config file
  try {
    unlinkSync(configPath);
  } catch {}

  if (exitCode !== 0) {
    throw new Error(`OpenSSL exited with non-zero status code: ${exitCode}`);
  }

  console.log(`\n✅ TLS certificates successfully generated in ./certs/`);
  console.log(`   • Certificate: ${certPath}`);
  console.log(`   • Private Key: ${keyPath}`);
  console.log(`   • Validity:    365 days`);
  console.log(`   • LAN Access:  Covers ${Array.from(ipAddresses).join(", ")}\n`);

  return {
    certPath,
    keyPath,
    sanList: [...dnsNames, ...Array.from(ipAddresses)],
  };
}

if (import.meta.main) {
  const argIp = process.argv[2];
  try {
    await generateCertificates(argIp);
  } catch (err: any) {
    console.error(`❌ Failed to generate certificates:`, err.message);
    process.exit(1);
  }
}
