import type { ModelViewerElement } from "@google/model-viewer";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<ModelViewerElement>, ModelViewerElement> & {
        alt?: string;
        ar?: boolean;
        "ar-modes"?: string;
        "ar-placement"?: "floor" | "wall";
        "ar-scale"?: "auto" | "fixed";
        "camera-controls"?: boolean;
        loading?: "auto" | "eager" | "lazy";
        reveal?: "auto" | "interaction" | "manual";
        src?: string;
        "touch-action"?: string;
      };
    }
  }
}

