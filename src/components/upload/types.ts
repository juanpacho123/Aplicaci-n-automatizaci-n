import type { FolderView, FolderEntry } from "@/lib/services/folders.service";

export type { FolderView, FolderEntry };

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  hasLocation: boolean;
  configuredStages: number;
  totalStages: number;
};

export type StageInfo = { key: string; label: string; order: number; folderId: string | null; folderName: string | null; available: boolean };

export type ProjectDetail = {
  project: { id: string; code: string; name: string; description: string | null; status: string };
  location: { id: string; rootName: string; rootPath: string; webUrl: string | null; companyName: string | null } | null;
  stages: StageInfo[];
};

export type UploadRules = {
  maxFileSizeMB: number;
  allowedExtensions: string[];
  maxFilesPerOperation: number;
  chunkSizeKB: number;
  maxRetries: number;
  parallelUploads: number;
};
