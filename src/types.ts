export interface ModCardInfo {
  name: string;
  folderName: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  isFolder: boolean;
  iconBase64: string | null;
  size?: number;
  hasConfig?: boolean;
}

export interface GameEnvStatus {
  hasGameExe: boolean;
  hasBepinex: boolean;
  hasWinhttp: boolean;
  hasDoorstopConfig: boolean;
  isEnvHealthy: boolean;
  enabledModCount: number;
  disabledModCount: number;
  totalModsBytes: number;
  fingerprint: string;
}

export type SortOption = "default" | "name-asc" | "name-desc" | "size-desc" | "status" | "category";
export type ViewMode = "card" | "compact";
export type ActiveTab = "local" | "market";
export type MarketSortOption = "downloads" | "rating" | "latest" | "name";

export interface ThunderstoreVersionRaw {
  name: string;
  fullName: string;
  versionNumber: string;
  description: string;
  icon: string;
  dependencies: string[];
  downloadUrl: string;
  downloads: number;
  dateCreated: string;
  fileSize: number;
}

export interface ThunderstorePackage {
  name: string;
  fullName: string;
  owner: string;
  packageUrl: string;
  isPinned: boolean;
  isDeprecated: boolean;
  ratingScore: number;
  categories: string[];
  latestVersion: ThunderstoreVersionRaw | null;
  totalDownloads: number;
}

export interface ModUpdateInfo {
  folderName: string;
  modName: string;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  description: string;
  iconUrl: string;
}

export interface MissingDependency {
  modName: string;
  folderName: string;
  requiredDependency: string;
  dependencyName: string;
  dependencyVersion: string | null;
}

export interface DuplicateDll {
  dllName: string;
  locations: string[];
}

export interface ConflictReport {
  hasConflicts: boolean;
  missingDependencies: MissingDependency[];
  duplicateDlls: DuplicateDll[];
}

export interface PackManifest {
  packName: string;
  author: string;
  version: string;
  description: string;
  categories: string[];
  modCategories: Record<string, string>;
}

export interface ExportNode {
  relativePath: string;
  name: string;
  isDir: boolean;
  size: number;
  isRecommended: boolean;
}

export interface ImportModEntry {
  name: string;
  isFolder: boolean;
}

export interface ImportPreview {
  packName: string;
  author: string;
  version: string;
  description: string;
  categories: string[];
  mods: ImportModEntry[];
  totalFiles: number;
}