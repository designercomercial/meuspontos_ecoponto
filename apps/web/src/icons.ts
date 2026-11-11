/**
 * Ícones Lucide (traço de 2 px, definido no CSS por --icon-stroke).
 * Importados um a um: só entram no bundle os que a página usa.
 */
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Gift,
  HeartHandshake,
  Info,
  KeyRound,
  MapPin,
  MessageCircle,
  PencilLine,
  Recycle,
  RefreshCw,
  RotateCcw,
  Scale,
  Send,
  Sparkles,
  TriangleExclamationPoint,
  Undo2,
  WifiOff,
  Zap,
  ZapOff,
  type IconNode,
} from "lucide";
import type { NomeIcone as NomeIconeFormat } from "@ecoponto/format";

export type NomeIcone =
  | NomeIconeFormat
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "file-text"
  | "info"
  | "key-round"
  | "map-pin"
  | "message-circle"
  | "pencil-line"
  | "refresh-cw"
  | "scale"
  | "wifi-off";

const ICONES: Record<NomeIcone, IconNode> = {
  "arrow-down-left": ArrowDownLeft,
  "arrow-up-right": ArrowUpRight,
  banknote: Banknote,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "circle-check": CircleCheck,
  clock: Clock,
  "file-text": FileText,
  gift: Gift,
  "heart-handshake": HeartHandshake,
  info: Info,
  "key-round": KeyRound,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
  "pencil-line": PencilLine,
  recycle: Recycle,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  scale: Scale,
  send: Send,
  sparkles: Sparkles,
  "triangle-alert": TriangleExclamationPoint,
  "undo-2": Undo2,
  "wifi-off": WifiOff,
  zap: Zap,
  "zap-off": ZapOff,
};

const SVG = "http://www.w3.org/2000/svg";

/** Ícone decorativo (aria-hidden). O significado vai sempre em texto ao lado. */
export function icone(nome: NomeIcone, classe = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", `icon ${classe}`.trim());
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.dataset.icone = nome;
  for (const [tag, attrs] of ICONES[nome]) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && k !== "key") el.setAttribute(k, String(v));
    }
    svg.append(el);
  }
  return svg;
}
