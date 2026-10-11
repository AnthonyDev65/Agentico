import type { IconSvgElement } from "@hugeicons/react";
import {
  File01Icon,
  ReactIcon,
  DocumentCodeIcon,
  FileScriptIcon,
  Css3Icon,
  Html5Icon,
  Image01Icon,
  Txt01Icon,
  SourceCodeIcon,
  CodeIcon,
  Settings01Icon,
  Key01Icon,
  MusicNote01Icon,
  Video01Icon,
  Pdf01Icon,
  TextFontIcon,
  Table01Icon,
  Flowchart01Icon,
  ThreeDRotateIcon,
} from "@hugeicons/core-free-icons";

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
export const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];
export const VIDEO_EXTS = ["mp4", "webm", "mov", "mkv", "avi", "m4v"];
export const FONT_EXTS = ["ttf", "otf", "woff", "woff2"];
export const MODEL_EXTS = ["glb", "gltf"];

export function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTS.includes(extOf(name));
}

export function isAudioFile(name: string): boolean {
  return AUDIO_EXTS.includes(extOf(name));
}
export function isVideoFile(name: string): boolean {
  return VIDEO_EXTS.includes(extOf(name));
}
export function isPdfFile(name: string): boolean {
  return extOf(name) === "pdf";
}
export function isFontFile(name: string): boolean {
  return FONT_EXTS.includes(extOf(name));
}
export function isModelFile(name: string): boolean {
  return MODEL_EXTS.includes(extOf(name));
}
export function isCsvFile(name: string): boolean {
  const e = extOf(name);
  return e === "csv" || e === "tsv";
}
export type MediaKind = "audio" | "video" | "pdf" | "font" | "model";
export function mediaKindOf(name: string): MediaKind | null {
  if (isAudioFile(name)) return "audio";
  if (isVideoFile(name)) return "video";
  if (isPdfFile(name)) return "pdf";
  if (isFontFile(name)) return "font";
  if (isModelFile(name)) return "model";
  return null;
}

export function isComponentFile(name: string): boolean {
  const e = extOf(name);
  return e === "tsx" || e === "jsx";
}

export function isEnvFile(name: string): boolean {
  return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
}

export function isMarkdownFile(name: string): boolean {
  const e = extOf(name);
  return e === "md" || e === "markdown";
}

export function isMermaidFile(name: string): boolean {
  const e = extOf(name);
  return e === "mmd" || e === "mermaid";
}

export function fileIcon(name: string): { icon: IconSvgElement; color: string } {
  if (isEnvFile(name)) return { icon: Key01Icon, color: "text-lime-400" };
  if (isAudioFile(name)) return { icon: MusicNote01Icon, color: "text-emerald-400" };
  if (isVideoFile(name)) return { icon: Video01Icon, color: "text-rose-400" };
  if (isFontFile(name)) return { icon: TextFontIcon, color: "text-purple-400" };
  switch (extOf(name)) {
    case "pdf":
      return { icon: Pdf01Icon, color: "text-red-400" };
    case "csv":
    case "tsv":
      return { icon: Table01Icon, color: "text-green-400" };
    case "mmd":
    case "mermaid":
      return { icon: Flowchart01Icon, color: "text-pink-400" };
    case "glb":
    case "gltf":
      return { icon: ThreeDRotateIcon, color: "text-orange-400" };
    case "tsx":
    case "jsx":
      return { icon: ReactIcon, color: "text-cyan-400" };
    case "ts":
      return { icon: DocumentCodeIcon, color: "text-blue-400" };
    case "js":
    case "mjs":
    case "cjs":
      return { icon: FileScriptIcon, color: "text-yellow-400" };
    case "json":
      return { icon: CodeIcon, color: "text-amber-400" };
    case "md":
    case "markdown":
      return { icon: Txt01Icon, color: "text-zinc-300" };
    case "css":
    case "scss":
    case "sass":
    case "less":
      return { icon: Css3Icon, color: "text-sky-400" };
    case "html":
    case "htm":
      return { icon: Html5Icon, color: "text-orange-400" };
    case "py":
      return { icon: FileScriptIcon, color: "text-emerald-400" };
    case "rs":
      return { icon: SourceCodeIcon, color: "text-orange-500" };
    case "yml":
    case "yaml":
    case "toml":
    case "env":
      return { icon: Settings01Icon, color: "text-zinc-400" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "bmp":
    case "ico":
    case "avif":
      return { icon: Image01Icon, color: "text-fuchsia-400" };
    default:
      return { icon: File01Icon, color: "text-zinc-500" };
  }
}
