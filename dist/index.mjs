// src/client.ts
import { randomUUID } from "crypto";

// src/types.ts
var NovaRegistryError = class extends Error {
  status;
  details;
  constructor(message, status, details) {
    super(message);
    this.name = "NovaRegistryError";
    this.status = status;
    this.details = details;
  }
};

// src/wallet.ts
import { Keypair } from "@stellar/stellar-sdk";
var StellarWallet = class {
  keypair;
  constructor(secret) {
    this.keypair = Keypair.fromSecret(secret);
  }
  get publicKey() {
    return this.keypair.publicKey();
  }
  signPaymentChallenge(payment, contentHash, idempotencyKey) {
    const challenge = buildPaymentChallenge(payment, this.publicKey, contentHash, idempotencyKey);
    const signature = this.keypair.sign(Buffer.from(challenge, "utf8"));
    return Buffer.from(signature).toString("base64");
  }
};
function buildPaymentChallenge(payment, payerAddress, contentHash, idempotencyKey) {
  const canonicalData = {
    amount: payment.amount,
    asset: payment.asset,
    expiresAt: payment.expiresAt,
    idempotencyKey,
    network: payment.network,
    nonce: payment.nonce,
    payerAddress,
    resource: payment.resource,
    contentHash
  };
  return JSON.stringify(canonicalData);
}

// src/client.ts
var NovaRegistrySDK = class {
  wallet;
  registryUrl;
  timeoutMs;
  network;
  constructor(config) {
    if (!config.stellarSecret) {
      throw new Error("stellarSecret is required");
    }
    if (!config.registryUrl) {
      throw new Error("registryUrl is required");
    }
    this.wallet = new StellarWallet(config.stellarSecret);
    this.registryUrl = config.registryUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 2e4;
    this.network = config.network ?? "testnet";
  }
  get payerAddress() {
    return this.wallet.publicKey;
  }
  async registerAsset(input) {
    const payload = {
      ...input,
      ownerAddress: input.ownerAddress ?? this.wallet.publicKey
    };
    const firstAttempt = await this.postJson("/v1/register", payload);
    if (firstAttempt.status >= 200 && firstAttempt.status < 300) {
      return firstAttempt.data;
    }
    if (!isPaymentRequired(firstAttempt.status, firstAttempt.data)) {
      throw new NovaRegistryError("Failed to register asset", firstAttempt.status, firstAttempt.data);
    }
    const idempotencyKey = randomUUID();
    const payment = firstAttempt.data.payment;
    const paymentSignature = this.wallet.signPaymentChallenge(payment, input.contentHash, idempotencyKey);
    const secondAttempt = await this.postJson("/v1/register", payload, {
      "payment-signature": paymentSignature,
      "x-idempotency-key": idempotencyKey,
      "x-payment-nonce": payment.nonce,
      "x-stellar-public-key": this.wallet.publicKey,
      "x-stellar-network": this.network
    });
    if (secondAttempt.status < 200 || secondAttempt.status >= 300) {
      throw new NovaRegistryError("Payment was signed but registration failed", secondAttempt.status, secondAttempt.data);
    }
    return secondAttempt.data;
  }
  async getRegistrationStatus(requestId) {
    const response = await this.getJson(`/v1/register/${encodeURIComponent(requestId)}`);
    if (response.status < 200 || response.status >= 300) {
      throw new NovaRegistryError("Failed to fetch registration status", response.status, response.data);
    }
    return response.data;
  }
  async getCertificate(certificateId) {
    const response = await this.getJson(`/v1/certificates/${encodeURIComponent(certificateId)}`);
    if (response.status < 200 || response.status >= 300) {
      throw new NovaRegistryError("Failed to fetch certificate", response.status, response.data);
    }
    return response.data;
  }
  async getCertificateByHash(contentHash) {
    const response = await this.getJson(
      `/v1/certificates/by-hash/${encodeURIComponent(contentHash)}`
    );
    if (response.status < 200 || response.status >= 300) {
      throw new NovaRegistryError("Failed to fetch certificate by hash", response.status, response.data);
    }
    return response.data;
  }
  async postJson(path, body, headers) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.registryUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      return {
        status: response.status,
        data: await parseJson(response)
      };
    } catch (error) {
      throw normalizeNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async getJson(path) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.registryUrl}${path}`, {
        method: "GET",
        headers: {
          "content-type": "application/json"
        },
        signal: controller.signal
      });
      return {
        status: response.status,
        data: await parseJson(response)
      };
    } catch (error) {
      throw normalizeNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
};
function isPaymentRequired(status, data) {
  if (status !== 402 || !data || typeof data !== "object") {
    return false;
  }
  const maybeData = data;
  return maybeData.error === "payment_required" && Boolean(maybeData.payment);
}
async function parseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
function normalizeNetworkError(error) {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Request timed out while contacting Nova Registry API");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unknown network error");
}
export {
  NovaRegistryError,
  NovaRegistrySDK
};
