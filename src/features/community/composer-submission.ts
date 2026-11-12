import type { components } from "../../platform/api/openapi";
import { ApiError } from "../../platform/api/api-error";

type Asset = Pick<components["schemas"]["AssetVO"], "assetId" | "status">;
type DynamicInput = components["schemas"]["DynamicWriteDto"];
type MutationResult = components["schemas"]["DynamicMutationVO"];
type CompleteDynamicInput = Omit<DynamicInput, "resortId"> & {
  resortId?: number | null;
};
type SubmissionPorts<T> = {
  isActive(): boolean;
  existingAssetId?(image: T): string | undefined;
  upload(image: T, index: number): Promise<Asset>;
  publish(input: CompleteDynamicInput): Promise<MutationResult>;
  remove(assetId: string): Promise<void>;
  publicationStarted?(): boolean;
};

export class ComposerSessionEndedError extends Error {
  constructor() {
    super("The composing account is no longer active");
  }
}

export class PublicationUnconfirmedError extends Error {
  constructor(cause: unknown) {
    super("The publication result is not confirmed", { cause });
  }
}

/** Stop issuing writes after the composing account's component unmounts. */
export async function publishWithImages<T>(
  input: {
    customFields?: Record<string, unknown>;
    contentFormat?: "plain_text" | "markdown_v1";
    content: string;
    resortId?: number;
    images: readonly T[];
  },
  ports: {
    isActive(): boolean;
    upload(image: T, index: number): Promise<Asset>;
    publish(input: DynamicInput): Promise<MutationResult>;
    remove(assetId: string): Promise<void>;
    publicationStarted?(): boolean;
  },
): Promise<MutationResult> {
  return submitWithImages(input, {
    ...ports,
    publish: ({ resortId, ...body }) =>
      ports.publish({
        ...body,
        ...(typeof resortId === "number" ? { resortId } : {}),
      }),
  });
}

export function saveEditedDynamicWithImages<T>(
  input: {
    customFields?: Record<string, unknown>;
    contentFormat?: "plain_text" | "markdown_v1";
    content: string;
    resortId: number | null;
    images: readonly T[];
  },
  ports: SubmissionPorts<T> & { existingAssetId(image: T): string | undefined },
): Promise<MutationResult> {
  return submitWithImages(input, ports);
}

async function submitWithImages<T>(
  input: {
    customFields?: Record<string, unknown>;
    contentFormat?: "plain_text" | "markdown_v1";
    content: string;
    resortId?: number | null;
    images: readonly T[];
  },
  ports: SubmissionPorts<T>,
): Promise<MutationResult> {
  const uploadedIds: string[] = [];
  const imageAssetIds: string[] = [];
  const assertActive = () => {
    if (!ports.isActive()) throw new ComposerSessionEndedError();
  };
  let publicationAttempted = false;
  try {
    for (const [index, image] of input.images.entries()) {
      assertActive();
      const existingId = ports.existingAssetId?.(image);
      if (existingId !== undefined) {
        imageAssetIds.push(existingId);
        continue;
      }
      const asset = await ports.upload(image, index);
      uploadedIds.push(asset.assetId);
      imageAssetIds.push(asset.assetId);
      assertActive();
      if (asset.status !== "ready")
        throw new Error("Image did not pass scanning");
    }
    assertActive();
    publicationAttempted = true;
    const result = await ports.publish({
      content: input.content.trim(),
      ...(input.contentFormat === undefined ? {} : { contentFormat: input.contentFormat }),
      ...(input.customFields === undefined
        ? {}
        : { customFields: input.customFields }),
      imageAssetIds,
      ...(input.resortId === undefined ? {} : { resortId: input.resortId }),
    });
    assertActive();
    return result;
  } catch (error) {
    // A timeout or malformed success response may follow a committed publication.
    // Keep those assets and require the author to check their own dynamics first.
    const definitiveRejection =
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408;
    const unknownPublication =
      (ports.publicationStarted?.() ?? publicationAttempted) &&
      !definitiveRejection;
    if (ports.isActive() && !unknownPublication) {
      await Promise.all(
        uploadedIds.map(async (assetId) => {
          if (ports.isActive())
            await ports.remove(assetId).catch(() => undefined);
        }),
      );
    }
    if (unknownPublication && ports.isActive())
      throw new PublicationUnconfirmedError(error);
    throw error;
  }
}
