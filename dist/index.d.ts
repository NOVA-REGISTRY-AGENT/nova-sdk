type StellarNetwork = "testnet" | "mainnet";
interface NovaRegistrySDKConfig {
    stellarSecret: string;
    registryUrl: string;
    network?: StellarNetwork;
    timeoutMs?: number;
}
interface RegisterAssetInput {
    contentHash: string;
    fileName?: string;
    title?: string;
    artist?: string;
    ownerAddress?: string;
    metadata?: Record<string, unknown>;
}
interface PaymentInstructions {
    amount: string;
    asset: string;
    network: string;
    resource: string;
    nonce: string;
    expiresAt: string;
    facilitator?: string;
    requiredHeaders?: string[];
}
interface RegisterAcceptedResponse {
    requestId: string;
    status: "queued" | "processing" | "confirmed" | "failed";
    paymentStatus?: "confirmed" | "failed" | "pending";
    message?: string;
}
interface RegisterStatusResponse {
    requestId: string;
    status: "queued" | "processing" | "confirmed" | "failed";
    paymentStatus?: "confirmed" | "failed" | "pending";
    certificateId: string | null;
    txHash: string | null;
    explorerUrl: string | null;
    createdAt?: string;
}
interface CertificateResponse {
    certificateId: string;
    title?: string;
    artist?: string;
    contentHash: string;
    ownerAddress: string;
    network: string;
    contractId?: string;
    txHash: string;
    explorerUrl: string;
    registeredAt: string;
    metadata?: Record<string, unknown>;
}
declare class NovaRegistryError extends Error {
    readonly status: number;
    readonly details?: unknown;
    constructor(message: string, status: number, details?: unknown);
}

declare class NovaRegistrySDK {
    private readonly wallet;
    private readonly registryUrl;
    private readonly timeoutMs;
    private readonly network;
    constructor(config: NovaRegistrySDKConfig);
    get payerAddress(): string;
    registerAsset(input: RegisterAssetInput): Promise<RegisterAcceptedResponse>;
    getRegistrationStatus(requestId: string): Promise<RegisterStatusResponse>;
    getCertificate(certificateId: string): Promise<CertificateResponse>;
    getCertificateByHash(contentHash: string): Promise<{
        exists: boolean;
        certificateId?: string;
        txHash?: string;
    }>;
    private postJson;
    private getJson;
}

export { type CertificateResponse, NovaRegistryError, NovaRegistrySDK, type NovaRegistrySDKConfig, type PaymentInstructions, type RegisterAcceptedResponse, type RegisterAssetInput, type RegisterStatusResponse, type StellarNetwork };
