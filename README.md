# @nova-registry/sdk-ts

SDK oficial de Nova Registry para Node.js y TypeScript. Permite que un agente o aplicacion registre assets digitales en un backend protegido con paywall x402 y pagos Stellar.

Este paquete implementa:
- cliente HTTP para el backend Nova Registry
- manejo automatico de HTTP 402 Payment Required
- firma Ed25519 con llaves Stellar
- reintento automatico de registro con headers de pago
- consultas de estado y certificados

## Tabla de contenidos

1. Vision general
2. Requisitos
3. Instalacion
4. Inicio rapido
5. Flujo detallado de pago x402
6. Referencia completa de API
7. Tipos y contratos de datos
8. Manejo de errores
9. Buenas practicas de seguridad
10. Integracion con backend
11. Scripts de desarrollo y publicacion
12. FAQ

## 1) Vision general

El SDK resuelve el flujo de pago por uso para agentes:

1. El cliente intenta registrar un asset en el endpoint principal.
2. Si el backend exige pago, responde 402 con instrucciones (amount, asset, nonce, expiresAt, resource).
3. El SDK firma un challenge canonico con la llave privada Stellar del agente.
4. El SDK reintenta automaticamente la misma peticion incluyendo la firma y headers requeridos.
5. El backend valida el pago y encola o confirma el registro.

## 2) Requisitos

- Node.js 18+ (recomendado 20+)
- Una secret key Stellar valida (formato S...)
- URL del backend Nova Registry
- Backend compatible con el contrato 402 documentado

## 3) Instalacion

Con pnpm:

```bash
pnpm add @nova-registry/sdk-ts
```

Con npm:

```bash
npm install @nova-registry/sdk-ts
```

Con yarn:

```bash
yarn add @nova-registry/sdk-ts
```

## 4) Inicio rapido

```ts
import { NovaRegistrySDK } from "@nova-registry/sdk-ts";
import crypto from "node:crypto";

const sdk = new NovaRegistrySDK({
  stellarSecret: process.env.AGENT_STELLAR_SECRET!,
  registryUrl: "https://api.novaregistry.com",
  network: "testnet",
  timeoutMs: 20_000,
});

async function protegerCancionAutonomamente() {
  const pistaAudioGenerada = Buffer.from("...datos_binarios_de_la_cancion_ia...");
  const hashCancion = crypto.createHash("sha256").update(pistaAudioGenerada).digest("hex");

  const recibo = await sdk.registerAsset({
    contentHash: `sha256:${hashCancion}`,
    fileName: "cybernetic-lullaby.wav",
    title: "Cybernetic Lullaby",
    artist: "Nova Agent",
    metadata: {
      genre: "synthwave",
      aiModel: "Claude 3.5 Sonnet / Audio Gen v2",
    },
  });

  console.log("Registro aceptado:", recibo);

  const estado = await sdk.getRegistrationStatus(recibo.requestId);
  console.log("Estado:", estado.status);
}

protegerCancionAutonomamente().catch((error) => {
  console.error("Error en registro autonomo:", error);
});
```

## 5) Flujo detallado de pago x402

Al llamar registerAsset:

1. El SDK envia POST /v1/register con body JSON.
2. Si la API responde 2xx, retorna RegisterAcceptedResponse directamente.
3. Si la API responde 402 y payload payment_required:
   - genera un x-idempotency-key unico (UUID)
   - construye challenge canonico con:
     - amount
     - asset
     - network
     - resource
     - nonce
     - expiresAt
     - payerAddress
     - contentHash
     - idempotencyKey
   - firma el challenge con Ed25519 usando la secret Stellar
4. Reintenta POST /v1/register con headers:
   - payment-signature
   - x-stellar-public-key
   - x-payment-nonce
   - x-idempotency-key
   - x-stellar-network
5. Si la segunda respuesta es 2xx, retorna RegisterAcceptedResponse.
6. Si la segunda respuesta no es 2xx, lanza NovaRegistryError.

## 6) Referencia completa de API

### Constructor

```ts
new NovaRegistrySDK(config: NovaRegistrySDKConfig)
```

Parametros:
- stellarSecret: string (obligatorio)
- registryUrl: string (obligatorio)
- network: testnet | mainnet (opcional, default testnet)
- timeoutMs: number (opcional, default 20000)

Propiedad publica:

```ts
sdk.payerAddress: string
```

Retorna la public key derivada de stellarSecret.

### registerAsset

```ts
registerAsset(input: RegisterAssetInput): Promise<RegisterAcceptedResponse>
```

Uso:
- registra un asset
- ejecuta flujo automatico 402 -> firma -> reintento

Campos input:
- contentHash: string (obligatorio, ej: sha256:...)
- fileName?: string
- title?: string
- artist?: string
- ownerAddress?: string (si no se envia, usa payerAddress)
- metadata?: Record<string, unknown>

### getRegistrationStatus

```ts
getRegistrationStatus(requestId: string): Promise<RegisterStatusResponse>
```

Uso:
- consulta estado del request de registro

Estados esperados:
- queued
- processing
- confirmed
- failed

### getCertificate

```ts
getCertificate(certificateId: string): Promise<CertificateResponse>
```

Uso:
- obtiene certificado final por id

### getCertificateByHash

```ts
getCertificateByHash(contentHash: string): Promise<{ exists: boolean; certificateId?: string; txHash?: string }>
```

Uso:
- valida si un hash ya tiene certificado

## 7) Tipos y contratos de datos

### NovaRegistrySDKConfig

```ts
interface NovaRegistrySDKConfig {
  stellarSecret: string;
  registryUrl: string;
  network?: "testnet" | "mainnet";
  timeoutMs?: number;
}
```

### RegisterAssetInput

```ts
interface RegisterAssetInput {
  contentHash: string;
  fileName?: string;
  title?: string;
  artist?: string;
  ownerAddress?: string;
  metadata?: Record<string, unknown>;
}
```

### PaymentRequiredResponse

```ts
interface PaymentRequiredResponse {
  error: "payment_required";
  message: string;
  payment: {
    amount: string;
    asset: string;
    network: string;
    resource: string;
    nonce: string;
    expiresAt: string;
    facilitator?: string;
    requiredHeaders?: string[];
  };
}
```

### RegisterAcceptedResponse

```ts
interface RegisterAcceptedResponse {
  requestId: string;
  status: "queued" | "processing" | "confirmed" | "failed";
  paymentStatus?: "confirmed" | "failed" | "pending";
  message?: string;
}
```

### RegisterStatusResponse

```ts
interface RegisterStatusResponse {
  requestId: string;
  status: "queued" | "processing" | "confirmed" | "failed";
  paymentStatus?: "confirmed" | "failed" | "pending";
  certificateId: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  createdAt?: string;
}
```

### CertificateResponse

```ts
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
```

## 8) Manejo de errores

El SDK expone NovaRegistryError para errores HTTP de negocio.

```ts
class NovaRegistryError extends Error {
  status: number;
  details?: unknown;
}
```

Recomendacion de manejo:

```ts
import { NovaRegistryError } from "@nova-registry/sdk-ts";

try {
  await sdk.registerAsset({ contentHash: "sha256:..." });
} catch (error) {
  if (error instanceof NovaRegistryError) {
    console.error("HTTP status:", error.status);
    console.error("Backend details:", error.details);
  } else {
    console.error("Error de red o runtime:", error);
  }
}
```

Errores comunes:
- timeout de red: Request timed out while contacting Nova Registry API
- payload 402 invalido: el SDK no puede activar el flujo de pago
- mismatch de firma/challenge: backend rechaza la segunda solicitud

## 9) Buenas practicas de seguridad

- Nunca hardcodear stellarSecret en codigo fuente.
- Usar variables de entorno y vault de secretos.
- Rotar llaves en entornos de produccion.
- Usar testnet para desarrollo y demos.
- Configurar timeoutMs segun latencia real de tu infraestructura.
- Evitar loggear contenido sensible de headers de pago.

## 10) Integracion con backend

Para integracion correcta, el backend debe:

1. Responder 402 con estructura payment_required compatible.
2. Validar los headers de pago en el segundo intento.
3. Validar nonce e idempotencia para evitar replay.
4. Validar firma Ed25519 con la public key enviada.
5. Mantener consistencia exacta del challenge canonico firmado.

Si el backend usa un canonical payload distinto al del SDK, la validacion fallara.

## 11) Scripts de desarrollo y publicacion

Comandos del paquete:

```bash
pnpm run typecheck
pnpm run build
pnpm run prepublishOnly
```

Build genera:
- dist/index.mjs (ESM)
- dist/index.js (CJS)
- dist/index.d.ts y dist/index.d.mts (tipos)

Publicacion:

```bash
pnpm publish --access public
```

## 12) FAQ

### El SDK ejecuta transacciones on-chain directamente?

No necesariamente. Este SDK firma el challenge de pago y orquesta el flujo HTTP x402. La liquidacion real depende del backend/facilitador.

### Puedo usar ownerAddress distinto del payer?

Si. ownerAddress puede representar al propietario de la obra, mientras payerAddress es la cuenta que firma el pago.

### Funciona con frontend browser?

Este paquete esta orientado a entorno Node.js porque maneja llaves privadas. Para browser se recomienda un wrapper con wallet segura o backend proxy.

## Licencia

MIT
