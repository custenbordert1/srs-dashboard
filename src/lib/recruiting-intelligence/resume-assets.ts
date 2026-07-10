import type { BreezyCandidateResumeFields } from "@/lib/breezy-api";

export type BreezyResumeAssetSource = "documents" | "resume" | "detail_inline" | "attachments" | "files";

export type BreezyResumeAsset = {
  source: BreezyResumeAssetSource;
  fileName: string | null;
  mimeType: string | null;
  url: string | null;
  parsedTextPreview: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function isResumeFileName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return false;
  if (/\.(pdf|doc|docx|rtf|txt|odt)$/i.test(normalized)) return true;
  return /resume|curriculum|vitae|\bcv\b/i.test(normalized);
}

function assetFromRecord(
  record: Record<string, unknown>,
  source: BreezyResumeAssetSource,
): BreezyResumeAsset | null {
  const fileName =
    stringFromUnknown(record.file_name) ||
    stringFromUnknown(record.filename) ||
    stringFromUnknown(record.name) ||
    stringFromUnknown(record.title) ||
    stringFromUnknown(record.original_name);
  const mimeType =
    stringFromUnknown(record.content_type) ||
    stringFromUnknown(record.mime_type) ||
    stringFromUnknown(record.type);
  const url =
    stringFromUnknown(record.url) ||
    stringFromUnknown(record.file_url) ||
    stringFromUnknown(record.download_url) ||
    stringFromUnknown(record.href);
  const parsedTextPreview =
    stringFromUnknown(record.text) ||
    stringFromUnknown(record.body) ||
    stringFromUnknown(record.content) ||
    stringFromUnknown(record.parsed_text) ||
    null;

  const resumeLike =
    isResumeFileName(fileName) ||
    /resume|cv|pdf|msword|wordprocessingml/i.test(mimeType) ||
    /resume|cv/i.test(stringFromUnknown(record.document_type) || stringFromUnknown(record.kind));

  if (!resumeLike && !parsedTextPreview) return null;

  return {
    source,
    fileName: fileName || null,
    mimeType: mimeType || null,
    url: url || null,
    parsedTextPreview: parsedTextPreview ? parsedTextPreview.slice(0, 500) : null,
  };
}

function collectAssetsFromArray(value: unknown, source: BreezyResumeAssetSource): BreezyResumeAsset[] {
  if (!Array.isArray(value)) return [];
  const assets: BreezyResumeAsset[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const asset = assetFromRecord(record, source);
    if (asset) assets.push(asset);
  }
  return assets;
}

export function extractResumeAssetsFromRaw(raw: Record<string, unknown>): BreezyResumeAsset[] {
  const assets: BreezyResumeAsset[] = [];
  for (const [key, source] of [
    ["documents", "detail_inline"],
    ["attachments", "attachments"],
    ["files", "files"],
  ] as const) {
    assets.push(...collectAssetsFromArray(raw[key], source));
  }

  const resumeRecord = asRecord(raw.resume);
  if (resumeRecord) {
    const asset = assetFromRecord(resumeRecord, "detail_inline");
    if (asset) assets.push(asset);
  }

  const resumeFileName =
    stringFromUnknown(raw.resume_file_name) ||
    stringFromUnknown(raw.resume_filename) ||
    stringFromUnknown(raw.resume_file);
  if (resumeFileName && isResumeFileName(resumeFileName)) {
    assets.push({
      source: "detail_inline",
      fileName: resumeFileName,
      mimeType: null,
      url: stringFromUnknown(raw.resume_url) || null,
      parsedTextPreview: null,
    });
  }

  return dedupeAssets(assets);
}

export function extractResumeAssetsFromDocumentsPayload(data: unknown): BreezyResumeAsset[] {
  if (Array.isArray(data)) {
    return dedupeAssets(collectAssetsFromArray(data, "documents"));
  }
  const record = asRecord(data);
  if (!record) return [];
  return dedupeAssets([
    ...collectAssetsFromArray(record.documents, "documents"),
    ...collectAssetsFromArray(record.data, "documents"),
    ...collectAssetsFromArray(record.items, "documents"),
    ...collectAssetsFromArray(record.results, "documents"),
  ]);
}

export function extractResumeAssetsFromResumeEndpointPayload(data: unknown): {
  assets: BreezyResumeAsset[];
  parsedText: string;
} {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return { assets: [], parsedText: "" };
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractResumeAssetsFromResumeEndpointPayload(JSON.parse(trimmed));
      } catch {
        return {
          assets: [
            {
              source: "resume",
              fileName: "resume.txt",
              mimeType: "text/plain",
              url: null,
              parsedTextPreview: trimmed.slice(0, 500),
            },
          ],
          parsedText: trimmed,
        };
      }
    }
    return {
      assets: [
        {
          source: "resume",
          fileName: "resume.txt",
          mimeType: "text/plain",
          url: null,
          parsedTextPreview: trimmed.slice(0, 500),
        },
      ],
      parsedText: trimmed,
    };
  }

  if (Array.isArray(data)) {
    const assets = dedupeAssets(collectAssetsFromArray(data, "resume"));
    const parsedText = assets
      .map((asset) => asset.parsedTextPreview ?? "")
      .filter(Boolean)
      .join("\n")
      .trim();
    return { assets, parsedText };
  }

  const record = asRecord(data);
  if (!record) return { assets: [], parsedText: "" };

  const assets = dedupeAssets([
    ...collectAssetsFromArray(record.documents, "resume"),
    ...collectAssetsFromArray(record.data, "resume"),
    ...collectAssetsFromArray(record.files, "resume"),
    ...(assetFromRecord(record, "resume") ? [assetFromRecord(record, "resume")!] : []),
  ]);

  const parsedText = [
    stringFromUnknown(record.text),
    stringFromUnknown(record.body),
    stringFromUnknown(record.content),
    stringFromUnknown(record.parsed_text),
    stringFromUnknown(record.resume_text),
    ...assets.map((asset) => asset.parsedTextPreview ?? ""),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  return { assets, parsedText };
}

function dedupeAssets(assets: BreezyResumeAsset[]): BreezyResumeAsset[] {
  const seen = new Set<string>();
  const out: BreezyResumeAsset[] = [];
  for (const asset of assets) {
    const key = `${asset.source}|${asset.fileName ?? ""}|${asset.url ?? ""}|${asset.parsedTextPreview ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

export function countResumeTextParts(resumeFields?: BreezyCandidateResumeFields): number {
  if (!resumeFields) return 0;
  return [
    resumeFields.headline,
    resumeFields.summary,
    resumeFields.coverLetter,
    resumeFields.resumeBody,
    resumeFields.workHistoryText,
    resumeFields.educationText,
    resumeFields.customAttributesText,
    resumeFields.tags?.join(" "),
  ].filter(Boolean).length;
}

export function resolveCandidateHasResume(input: {
  resumeText: string;
  resumeFields?: BreezyCandidateResumeFields;
  resumeAssets?: BreezyResumeAsset[];
  legacyHasResume?: boolean;
}): boolean {
  if (input.legacyHasResume) return true;
  if (input.resumeAssets && input.resumeAssets.length > 0) return true;

  const resumeText = input.resumeText.trim();
  const parts = countResumeTextParts(input.resumeFields);
  if (resumeText.length >= 80) return true;
  if (resumeText.length >= 40 && parts >= 2) return true;
  return false;
}

export function mergeResumeTextWithAssets(input: {
  resumeText: string;
  resumeAssets?: BreezyResumeAsset[];
  supplementalParsedText?: string;
}): string {
  const chunks = [
    input.resumeText.trim(),
    input.supplementalParsedText?.trim() ?? "",
    ...(input.resumeAssets ?? []).map((asset) => asset.parsedTextPreview?.trim() ?? "").filter(Boolean),
  ].filter(Boolean);
  return [...new Set(chunks)].join("\n").trim();
}
