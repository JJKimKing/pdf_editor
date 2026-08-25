/**
 * Minimal inline stroke icons (16x16, currentColor) so the app doesn't pull
 * in an icon font/library for a handful of glyphs. Keep additions here in
 * the same style: 1.6 stroke width, round joins.
 */
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9v-5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V20h2.5a1 1 0 0 0 1-1v-9" />
    </Icon>
  );
}

export function PdfToDocxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3.5h7l4 4V19a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 19V4.7A1.2 1.2 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.2" />
      <path d="M9 14.5h1.6a1.4 1.4 0 1 0 0-2.8H9v5.6" />
      <path d="M13.6 17.3v-5.6h1.5a1.9 1.9 0 0 1 0 5.6h-1.5Z" />
      <path d="M18.4 11.7v5.6" />
      <path d="M18.4 14.5h1.6" />
    </Icon>
  );
}

export function DocxToPdfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 3.5h7l4 4V19a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 19V4.7A1.2 1.2 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.2" />
      <path d="M9 11.7h1.7a1.5 1.5 0 0 1 0 3H9v-3Zm0 3v2.6" />
      <path d="M13.6 17.3v-5.6h2.8" />
      <path d="M13.6 14.5h2" />
      <path d="M18.6 11.7v5.6" />
    </Icon>
  );
}

export function MetadataIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h5.6c.5 0 .97.2 1.32.55l6.03 6.03a1.87 1.87 0 0 1 0 2.64l-5.76 5.76a1.87 1.87 0 0 1-2.64 0l-6.03-6.03A1.87 1.87 0 0 1 4 11.6Z" />
      <circle cx="8.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.6 1.6" />
      <path d="M8 3.5 5 6" />
      <path d="M16 3.5 19 6" />
    </Icon>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.5v2.3M12 18.2v2.3M4.7 6.7l1.6 1.6M17.7 15.7l1.6 1.6M3.5 12h2.3M18.2 12h2.3M4.7 17.3l1.6-1.6M17.7 8.3l1.6-1.6" />
    </Icon>
  );
}

export function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6.2A1.2 1.2 0 0 1 5.2 5h4.4l1.6 2h8.6A1.2 1.2 0 0 1 21 8.2v9.6A1.2 1.2 0 0 1 19.8 19H5.2A1.2 1.2 0 0 1 4 17.8Z" />
    </Icon>
  );
}

export function BatchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="11" height="11" rx="1.4" />
      <path d="M9 20h9.8A1.2 1.2 0 0 0 20 18.8V9" />
    </Icon>
  );
}
